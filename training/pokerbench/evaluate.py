"""Measure PokerBench action accuracy over the Sail API, base vs tuned.

    python evaluate.py --limit 100                          # base Kimi K2.6
    python evaluate.py --limit 100 --lora pokerbench-sft-v1  # after training

Run it on the base model *before* training. A fine-tune with no baseline to
compare against tells you nothing about whether it helped.

Two numbers, because they fail differently:

  exact      — right verb AND right size. PokerBench's own strict metric.
  verb-only  — right verb, size ignored. "raise 16" when the label says
               "raise 13" is a good decision sized slightly wrong; a single
               exact-match number scores it identically to folding, which
               hides real progress.

A third, `unparsed`, counts completions with no action in them at all. That is
a formatting failure rather than a poker failure, and it is the one an untuned
base model makes most.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
import time
from collections import Counter

import pokerbench_data as pb

SAIL_BASE_URL = "https://api.sailresearch.com/v1"

# The label is 1-3 tokens. Anything more is prose we would only throw away, and
# on a reasoning model an ample budget invites it to think instead of answer.
MAX_TOKENS = 16

# Held-out by construction: training defaults start from row 0, so evaluating
# from here does not score the model on hands it was fitted to.
DEFAULT_OFFSET = 500_000


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=100, help="Hands to evaluate")
    parser.add_argument("--offset", type=int, default=DEFAULT_OFFSET,
                        help="Skip this many rows first, to stay off the training slice")
    parser.add_argument("--lora", default=None,
                        help="Uploaded Sail LoRA name; omit to evaluate the base model")
    parser.add_argument("--model", default=pb.BASE_MODEL)
    parser.add_argument("--concurrency", type=int, default=8)
    parser.add_argument("--completion-window", default=None,
                        choices=("asap", "priority", "standard", "flex"),
                        help="Defaults to asap for the base model, priority with --lora "
                             "(asap is rejected for LoRA requests)")
    parser.add_argument("--show", type=int, default=5, help="Example completions to print")
    return parser.parse_args()


def resolve_window(args: argparse.Namespace) -> str:
    """Pick a completion window the request will actually be accepted with.

    Verified against the live API: `asap` with a LoRA returns
    400 "lora requests cannot use completion_window=asap". Measured cost of the
    fallback: ~8.5s per request on `priority` versus ~1.4s on `asap`.
    """
    if args.completion_window:
        if args.lora and args.completion_window == "asap":
            sys.exit("completion_window=asap is rejected for LoRA requests; use priority, "
                     "standard, or flex.")
        return args.completion_window
    return "priority" if args.lora else "asap"


async def evaluate(args: argparse.Namespace) -> None:
    from openai import AsyncOpenAI

    api_key = os.environ.get("SAIL_API_KEY", "").strip()
    if not api_key:
        sys.exit("Missing SAIL_API_KEY (same key as VITE_SAIL_API_KEY in ../../.env).")

    window = resolve_window(args)
    print(f"Loading {args.limit} hands from {pb.DATASET_ID} (offset {args.offset})...")
    rows = pb.load_rows(split="train", limit=args.offset + args.limit)[args.offset :]
    if len(rows) < args.limit:
        print(f"  only {len(rows)} rows available past offset {args.offset}")
    pb.validate_rows(rows)

    client = AsyncOpenAI(base_url=SAIL_BASE_URL, api_key=api_key)
    metadata: dict[str, str] = {"completion_window": window}
    if args.lora:
        metadata["lora"] = args.lora

    label = f"{args.model} + lora {args.lora}" if args.lora else args.model
    print(f"Evaluating {label} on {len(rows)} hands "
          f"(completion_window={window}, concurrency={args.concurrency})")

    semaphore = asyncio.Semaphore(args.concurrency)

    async def ask(row: dict) -> tuple[dict, str | None]:
        async with semaphore:
            try:
                response = await client.chat.completions.create(
                    model=args.model,
                    messages=pb.build_prompt(row["instruction"]),
                    max_completion_tokens=MAX_TOKENS,
                    temperature=0.0,
                    # Reasoning is the dominant latency term on Sail: measured on
                    # Kimi, leaving it on costs 26-49s per request and can consume
                    # the whole budget without emitting an answer.
                    reasoning_effort="none",
                    extra_body={"metadata": metadata},
                )
                return row, (response.choices[0].message.content or "")
            except Exception as error:
                # One failed request should not throw away a paid evaluation run.
                print(f"  request failed: {type(error).__name__}: {error}", file=sys.stderr)
                return row, None

    started = time.time()
    results = await asyncio.gather(*[ask(row) for row in rows])
    elapsed = time.time() - started

    exact = verb_only = unparsed = errors = 0
    predicted_verbs: Counter[str] = Counter()
    examples: list[tuple[str, str]] = []

    for row, completion in results:
        if completion is None:
            errors += 1
            continue
        is_exact, is_verb = pb.actions_match(completion, row["output"])
        exact += is_exact
        verb_only += is_verb
        action = pb.parse_action(completion)
        if action is None:
            unparsed += 1
        else:
            predicted_verbs[action.verb] += 1
        if len(examples) < args.show:
            examples.append((row["output"], completion.strip()))

    scored = len(results) - errors
    if not scored:
        sys.exit("Every request failed; nothing to report.")

    print(f"\n{scored} hands scored in {elapsed:.0f}s ({elapsed / scored:.1f}s per request)")
    print(f"  exact      {exact:>4}/{scored}  {100 * exact / scored:5.1f}%")
    print(f"  verb-only  {verb_only:>4}/{scored}  {100 * verb_only / scored:5.1f}%")
    print(f"  unparsed   {unparsed:>4}/{scored}  {100 * unparsed / scored:5.1f}%")
    if errors:
        print(f"  errors     {errors:>4} request(s) failed and were not scored")
    print(f"  predicted verbs: {dict(predicted_verbs.most_common())}")

    if examples:
        print("\nExamples (label -> completion):")
        for want, got in examples:
            print(f"  {want!r:16} -> {got!r}")


def main() -> None:
    asyncio.run(evaluate(parse_args()))


if __name__ == "__main__":
    main()
