"""PokerBench loading, chat rendering, and action parsing.

PokerBench (RZ412/PokerBench, 563k rows) is two text columns:

    instruction: "You are a specialist in playing 6-handed No Limit Texas
                  Holdem... Your optimal action is: "
    output:      "bet 18" | "raise 13" | "check" | "call" | "fold"

The instruction is already a fully-formed prompt ending in "Your optimal action
is: ", so it needs no prompt engineering — it goes in as the user message and
the output becomes the assistant message. Only the assistant tokens get loss
weight, which is what TrainOnWhat.ALL_ASSISTANT_MESSAGES does.

Everything about parsing is shared between training and evaluation on purpose:
if the two disagree about what counts as a correct action, the eval numbers are
meaningless.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable

DATASET_ID = "RZ412/PokerBench"

# Kimi K2.6 is the only base model Sail serves LoRAs for (max rank 32).
BASE_MODEL = "moonshotai/Kimi-K2.6"

# Reasoning disabled: PokerBench's own instruction says "Do not explain your
# answer", the label is 1-3 tokens, and thinking tokens are pure latency here.
RENDERER_NAME = "kimi_k26_disable_thinking"

# Every label in the dataset is one of these. `bet` and `raise` carry an amount.
ACTION_VERBS = ("fold", "check", "call", "bet", "raise")

# Words a model puts between the verb and the number when it phrases the action
# as prose: "raise to 3.5", "raise it to 3", "bet up to 18". Kept to a short
# allowlist rather than "any text", so a completion like "raise. The pot is 18"
# does not silently harvest an unrelated number as the bet size.
_FILLER = r"(?:to|up|by|of|it|the|pot|about|around|approximately)"

_ACTION_RE = re.compile(
    r"\b(fold|check|call|bet|raise)\b"
    rf"(?:(?:\s+{_FILLER}){{0,3}}\s*\$?\s*([0-9]+(?:\.[0-9]+)?))?",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class Action:
    """A parsed poker action: the verb, plus an amount for bet/raise."""

    verb: str
    amount: float | None = None

    def __str__(self) -> str:
        if self.amount is None:
            return self.verb
        # Match the dataset's own formatting: integers print without ".0".
        amount = int(self.amount) if float(self.amount).is_integer() else self.amount
        return f"{self.verb} {amount}"


def parse_action(text: str) -> Action | None:
    """Pull the action out of a model completion, or None if there isn't one.

    Deliberately lenient about what surrounds the action — a model that has not
    been fine-tuned yet will wrap its answer in prose ("I would bet 18 here"),
    and scoring that as a format failure would confuse "wrong decision" with
    "didn't follow instructions". The FIRST action mentioned wins, since a
    rambling completion tends to state its answer and then justify it.
    """
    match = _ACTION_RE.search(text or "")
    if match is None:
        return None
    verb = match.group(1).lower()
    raw_amount = match.group(2)
    if verb in ("bet", "raise"):
        # A bet with no number is not a usable action.
        if raw_amount is None:
            return None
        return Action(verb, float(raw_amount))
    # "call 10" is still just a call; the amount is implied by the pot.
    return Action(verb)


def actions_match(predicted: str, reference: str) -> tuple[bool, bool]:
    """Compare a completion to a label.

    Returns (exact, verb_only):
      exact     — same verb AND same amount. The strict PokerBench metric.
      verb_only — same verb, amount ignored. Worth tracking separately because
                  "raise, but 16 instead of 13" is a far better answer than
                  "fold", and a single exact-match number hides that.
    """
    got = parse_action(predicted)
    want = parse_action(reference)
    if got is None or want is None:
        return False, False
    if got.verb != want.verb:
        return False, False
    if want.amount is None:
        return True, True
    if got.amount is None:
        return False, True
    return abs(got.amount - want.amount) < 1e-6, True


def build_conversation(row: dict) -> list[dict]:
    """One PokerBench row as a chat conversation.

    The instruction has leading/trailing whitespace in the raw dataset; it is
    stripped so the rendered prompt is stable, and so a prompt built here
    matches one built at inference time in the app.
    """
    return [
        {"role": "user", "content": (row["instruction"] or "").strip()},
        {"role": "assistant", "content": (row["output"] or "").strip()},
    ]


def build_prompt(instruction: str) -> list[dict]:
    """Inference-time counterpart of build_conversation: user turn only."""
    return [{"role": "user", "content": (instruction or "").strip()}]


def load_rows(split: str = "train", limit: int | None = None) -> list[dict]:
    """Load PokerBench rows as plain dicts.

    Streams rather than materialising all 563k rows, since every caller here
    wants a small slice.
    """
    from datasets import load_dataset

    if limit is None:
        dataset = load_dataset(DATASET_ID, split=split)
        return [dict(row) for row in dataset]

    stream = load_dataset(DATASET_ID, split=split, streaming=True)
    rows: list[dict] = []
    for row in stream:
        rows.append(dict(row))
        if len(rows) >= limit:
            break
    return rows


def validate_rows(rows: Iterable[dict]) -> None:
    """Fail loudly if the dataset shape is not what the pipeline assumes.

    A silent schema change (renamed column, unparseable label) would otherwise
    show up as a model that trains fine and predicts nothing useful.
    """
    rows = list(rows)
    if not rows:
        raise ValueError(f"{DATASET_ID} returned no rows")
    for index, row in enumerate(rows):
        if "instruction" not in row or "output" not in row:
            raise ValueError(
                f"row {index} has columns {sorted(row)}; expected 'instruction' and 'output'"
            )
        if parse_action(row["output"]) is None:
            raise ValueError(f"row {index} has an unparseable label: {row['output']!r}")
