"""GRPO-style RL on PokerBench: rollouts sampled on Sail, graded against the label.

    python rl.py --smoke-test                    # no API calls, checks the wiring
    python rl.py --steps 4 --groups-per-step 4 --group-size 4

SFT (`sft.py`) is the cheaper and more natural fit for PokerBench — the dataset
is a labelled prompt/action corpus, which is exactly what supervised training
wants. RL earns its keep in one specific way: reward can score *partial*
correctness. "raise 16" when the label says "raise 13" is a good answer that
cross-entropy punishes about as hard as "fold", whereas here it scores 0.7.

Cost warning: every rollout is a billed Sail request, and LoRA/checkpoint
requests cannot use `asap` — measured ~8.5s each on `priority`. The defaults
below are ~64 requests. Read them as a budget, not a starting point.

The loop is the standard one: sample a group per prompt, center rewards within
the group to get advantages, train on the group with `importance_sampling`. The
policy samples from the *current* weights via a fresh Tinker checkpoint each
step, which is what keeps this on-policy.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import random
import sys
from typing import Any

import pokerbench_data as pb

MAX_RANK = 32

# Enough for "raise 13" and nothing more. The renderer disables thinking and
# PokerBench's own instruction says not to explain, so a long budget would only
# buy latency — and every sampled token here is billed.
MAX_SAMPLE_TOKENS = 16

# Partial credit for the right decision at the wrong size. Chosen so verb-only
# beats a confident wrong verb by a wide margin but still loses clearly to an
# exact match: the sizing is real information, not a rounding error.
VERB_ONLY_REWARD = 0.7


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--steps", type=int, default=4,
                        help="Optimizer steps (each samples groups-per-step x group-size)")
    parser.add_argument("--groups-per-step", type=int, default=4,
                        help="Distinct PokerBench hands per step")
    parser.add_argument("--group-size", type=int, default=4,
                        help="Rollouts per hand; advantages are centered within a group")
    parser.add_argument("--rank", type=int, default=MAX_RANK)
    parser.add_argument("--learning-rate", type=float, default=2e-5,
                        help="Lower than SFT: RL updates are noisier")
    parser.add_argument("--temperature", type=float, default=1.0,
                        help="Needs to be >0, or every rollout in a group is identical "
                             "and all advantages are zero")
    parser.add_argument("--completion-window", default="priority",
                        choices=("priority", "standard", "flex"),
                        help="`asap` is rejected for checkpoint/LoRA requests")
    parser.add_argument("--checkpoint-name", default="pokerbench-rl-final")
    parser.add_argument("--checkpoint-ttl", type=int, default=7 * 24 * 3600)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--smoke-test", action="store_true",
                        help="Check data, renderer and reward wiring without any API call")
    return parser.parse_args()


def require_keys() -> None:
    missing = [name for name in ("TINKER_API_KEY", "SAIL_API_KEY") if not os.environ.get(name)]
    if missing:
        sys.exit(
            f"Missing {', '.join(missing)}.\n"
            "RL needs both: Tinker trains the adapter, Sail samples the rollouts.\n"
            "  export TINKER_API_KEY=...\n"
            "  export SAIL_API_KEY=sk_...  # same key as VITE_SAIL_API_KEY in ../../.env"
        )


def score(completion: str, label: str) -> tuple[float, dict[str, float]]:
    """Reward for one sampled action, plus metrics worth watching.

    Graded with the same parser training uses (`pokerbench_data.actions_match`),
    so a reward here means the same thing an `evaluate.py` accuracy point does.
    """
    exact, verb_only = pb.actions_match(completion, label)
    if exact:
        reward = 1.0
    elif verb_only:
        reward = VERB_ONLY_REWARD
    else:
        reward = 0.0
    return reward, {
        "reward": reward,
        "exact": float(exact),
        "verb_only": float(verb_only),
        # An unparseable completion is a different failure from a wrong action,
        # and the fix is different too (renderer/token budget, not more training).
        "unparsed": float(pb.parse_action(completion) is None),
    }


class PokerHand:
    """One PokerBench hand as a single-turn Tinker RL environment.

    Single-turn: the model sees the scenario, names an action, and the episode
    ends. There is no multi-step interaction to model — PokerBench labels one
    decision per row.
    """

    def __init__(self, row: dict, renderer: Any):
        self.row = row
        self.renderer = renderer

    async def initial_observation(self):
        prompt = self.renderer.build_generation_prompt(pb.build_prompt(self.row["instruction"]))
        return prompt, self.renderer.get_stop_sequences()

    async def step(self, action, *, extra=None):
        import tinker
        from tinker_cookbook import renderers
        from tinker_cookbook.rl.types import StepResult

        message, _ = self.renderer.parse_response(action)
        completion = renderers.get_text_content(message)
        reward, metrics = score(completion, self.row["output"])
        return StepResult(
            reward=reward,
            episode_done=True,
            next_observation=tinker.ModelInput.from_ints([]),
            next_stop_condition=[],
            metrics=metrics,
            logs={"completion": completion, "label": self.row["output"]},
        )


def make_group_builder(row: dict, renderer: Any, group_size: int):
    """A group of identical envs for one hand.

    GRPO needs several rollouts of the *same* prompt so their rewards can be
    centered against each other; the variation comes from sampling temperature,
    not from the environment.
    """
    from tinker_cookbook.rl.types import EnvGroupBuilder

    class PokerHandGroup(EnvGroupBuilder):
        async def make_envs(self):
            return [PokerHand(row, renderer) for _ in range(group_size)]

        def logging_tags(self):
            return ["pokerbench"]

    return PokerHandGroup()


async def build_policy(training_client: Any, args: argparse.Namespace, step: int):
    """Snapshot current weights and point a Sail sampler at them.

    This is the one place the two services meet. Sail can sample straight from a
    Tinker checkpoint given a signed URL, which is what makes on-policy RL
    possible without an upload round-trip per step — and it is also why RL uses
    `SailTokenCompleter` while the *app* uses an uploaded LoRA instead
    (see export_and_upload.py for why the app cannot take this path).
    """
    import tinker
    from sail.tinker import SailTokenCompleter, get_tinker_checkpoint_signed_url_async

    save = await training_client.save_weights_for_sampler_async(f"rl-step-{step:04d}")
    path = (await save.result_async()).path
    signed_url = await get_tinker_checkpoint_signed_url_async(
        tinker.ServiceClient(), path, ttl_seconds=3600
    )
    adapter_config = {
        "peft_type": "LORA",
        "r": args.rank,
        "lora_alpha": args.rank,
        # Sail does not restrict Kimi K2.6 LoRAs to a target-module allowlist,
        # so "all" is both allowed and correct — naming a narrow subset here
        # would silently drop the modules Tinker actually trained.
        "target_modules": "all",
        "task_type": "CAUSAL_LM",
    }
    return SailTokenCompleter(
        model=pb.BASE_MODEL,
        max_tokens=MAX_SAMPLE_TOKENS,
        temperature=args.temperature,
        completion_window=args.completion_window,
        tinker_lora_signed_url=signed_url,
        adapter_config=adapter_config,
        tinker_lora_name=f"pokerbench-rl-step-{step}",
    ), path


def smoke_test(args: argparse.Namespace) -> None:
    """Exercise everything that does not cost money."""
    from tinker_cookbook.renderers import get_renderer
    from tinker_cookbook.tokenizer_utils import get_tokenizer

    rows = pb.load_rows(split="train", limit=args.groups_per_step * args.group_size)
    pb.validate_rows(rows)
    print(f"{len(rows)} rows validated")

    renderer = get_renderer(pb.RENDERER_NAME, tokenizer=get_tokenizer(pb.BASE_MODEL))
    prompt = renderer.build_generation_prompt(pb.build_prompt(rows[0]["instruction"]))
    print(f"renderer {pb.RENDERER_NAME}: prompt is {len(prompt.to_ints())} tokens, "
          f"stop={renderer.get_stop_sequences()!r}")

    label = rows[0]["output"]
    print(f"\nreward against label {label!r}:")
    for candidate in (label, "fold", "I would probably " + label, "hmm"):
        reward, metrics = score(candidate, label)
        print(f"  {candidate!r:40} -> {reward:.2f}  {metrics}")

    total = args.steps * args.groups_per_step * args.group_size
    print(f"\nA real run would make {total} Sail requests "
          f"(~{total * 8.5 / 60:.0f} min at the measured ~8.5s on "
          f"{args.completion_window}), plus {args.steps} Tinker steps.")


async def train(args: argparse.Namespace) -> str:
    import tinker
    from tinker_cookbook.renderers import get_renderer
    from tinker_cookbook.rl.data_processing import assemble_training_data, compute_advantages
    from tinker_cookbook.rl.rollouts import do_group_rollout
    from tinker_cookbook.rl.train import train_step
    from tinker_cookbook.tokenizer_utils import get_tokenizer

    if args.rank > MAX_RANK:
        sys.exit(f"--rank {args.rank} exceeds the rank {MAX_RANK} Sail serves for "
                 f"{pb.BASE_MODEL}.")

    needed = args.steps * args.groups_per_step
    print(f"Loading {needed} hands from {pb.DATASET_ID}...")
    rows = pb.load_rows(split="train", limit=needed)
    pb.validate_rows(rows)
    random.Random(args.seed).shuffle(rows)

    renderer = get_renderer(pb.RENDERER_NAME, tokenizer=get_tokenizer(pb.BASE_MODEL))
    service_client = tinker.ServiceClient()
    training_client = await service_client.create_lora_training_client_async(
        base_model=pb.BASE_MODEL, rank=args.rank
    )
    print(f"Training client ready: {pb.BASE_MODEL} @ rank {args.rank}")

    for step in range(args.steps):
        policy, checkpoint = await build_policy(training_client, args, step)
        batch = rows[step * args.groups_per_step : (step + 1) * args.groups_per_step]
        if not batch:
            break

        groups = await asyncio.gather(*[
            do_group_rollout(make_group_builder(row, renderer, args.group_size), policy)
            for row in batch
        ])

        rewards = [r for group in groups for r in group.get_total_rewards()]
        mean_reward = sum(rewards) / len(rewards) if rewards else 0.0

        # A group whose rollouts all scored the same contributes zero advantage,
        # so it carries no gradient — training on it wastes a paid step.
        advantages = compute_advantages(list(groups))
        useful = [
            (group, advantage)
            for group, advantage in zip(groups, advantages)
            if float(advantage.abs().sum()) > 0
        ]
        if not useful:
            print(f"  step {step + 1}/{args.steps} | reward {mean_reward:.3f} | "
                  "every group scored uniformly, nothing to learn from — skipped")
            continue

        data, _ = assemble_training_data(
            [group for group, _ in useful], [advantage for _, advantage in useful]
        )
        metrics: dict[str, Any] = {}
        await train_step(
            data_D=data,
            training_client=training_client,
            learning_rate=args.learning_rate,
            num_substeps=1,
            loss_fn="importance_sampling",
            metrics=metrics,
        )
        print(f"  step {step + 1}/{args.steps} | reward {mean_reward:.3f} | "
              f"{len(useful)}/{len(groups)} groups usable | {len(data)} datums")

    print(f"Saving sampler weights as {args.checkpoint_name!r}...")
    save = await training_client.save_weights_for_sampler_async(
        args.checkpoint_name, ttl_seconds=args.checkpoint_ttl
    )
    path = (await save.result_async()).path
    print(f"\nCheckpoint: {path}")
    print("Serve it in the game with:\n"
          f"  python export_and_upload.py --tinker-path '{path}' --name pokerbench-rl-v1")
    return path


def main() -> None:
    args = parse_args()
    if args.smoke_test:
        smoke_test(args)
        return
    if args.temperature <= 0:
        sys.exit("--temperature must be > 0, or every rollout in a group is identical "
                 "and no group produces a gradient.")
    require_keys()
    asyncio.run(train(args))


if __name__ == "__main__":
    main()
