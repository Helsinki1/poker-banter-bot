"""Score a Tinker checkpoint on PokerBench without downloading it.

    python evaluate_checkpoint.py \
        --tinker-path "tinker://<run-id>/sampler_weights/pokerbench-sft-v1" \
        --limit 60

Companion to evaluate.py, which measures the same thing over chat completions.
The split matters and is not cosmetic:

  evaluate.py            base model, or an *uploaded* LoRA, via chat completions
  evaluate_checkpoint.py a Tinker checkpoint, via sail.SailTokenCompleter

You cannot swap them. Per Sail's docs, "a plain text Responses or Chat
Completions request that happens to carry Tinker checkpoint metadata is served
by the base model" — so scoring a checkpoint through evaluate.py would silently
measure base Kimi and report it as the fine-tune. `SailTokenCompleter` is the
only path on which a checkpoint adapter actually loads.

The upside is that this needs no export, no upload, and no local checkpoint
copy: Sail fetches the archive from a signed URL itself. Use this to find out
whether a run is worth uploading, then run export_and_upload.py for the app,
which does need the uploaded form.

Token IDs go in and come out — the completer bypasses chat templating entirely,
so the prompt is rendered here with the same renderer training used. That is
what keeps this comparable to the training distribution rather than to whatever
the server's default template would have produced.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
import time
from collections import Counter

import pokerbench_data as pb

MAX_RANK = 32

# The label is 1-3 tokens; PokerBench's own instruction says not to explain.
MAX_TOKENS = 16

# Held-out by construction: training defaults start from row 0.
DEFAULT_OFFSET = 500_000


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tinker-path", required=True,
                        help="tinker://<run-id>/sampler_weights/<name>")
    parser.add_argument("--limit", type=int, default=60)
    parser.add_argument("--offset", type=int, default=DEFAULT_OFFSET)
    parser.add_argument("--rank", type=int, default=MAX_RANK,
                        help="Rank the checkpoint was trained at; must match")
    parser.add_argument("--concurrency", type=int, default=8)
    parser.add_argument("--completion-window", default="priority",
                        choices=("priority", "standard", "flex"),
                        help="`asap` is rejected for LoRA/checkpoint requests")
    parser.add_argument("--temperature", type=float, default=0.0,
                        help="0 for a deterministic accuracy number")
    parser.add_argument("--ttl", type=int, default=3600,
                        help="Checkpoint TTL to set while resolving the URL")
    parser.add_argument("--show", type=int, default=8)
    return parser.parse_args()


def require_keys() -> None:
    missing = [n for n in ("TINKER_API_KEY", "SAIL_API_KEY") if not os.environ.get(n)]
    if missing:
        sys.exit(
            f"Missing {', '.join(missing)}.\n"
            "Tinker resolves the checkpoint URL; Sail runs the sampling.\n"
            "  export TINKER_API_KEY=...\n"
            "  export SAIL_API_KEY=sk_...  # same key as VITE_SAIL_API_KEY in ../../.env"
        )


async def run(args: argparse.Namespace) -> None:
    import tinker
    from sail import SailTokenCompleter, get_tinker_checkpoint_signed_url_async
    from tinker_cookbook import renderers
    from tinker_cookbook.renderers import get_renderer
    from tinker_cookbook.tokenizer_utils import get_tokenizer

    if args.rank > MAX_RANK:
        sys.exit(f"--rank {args.rank} exceeds the rank {MAX_RANK} Sail serves for "
                 f"{pb.BASE_MODEL}.")

    print(f"Loading {args.limit} hands from {pb.DATASET_ID} (offset {args.offset})...")
    rows = pb.load_rows(split="train", limit=args.offset + args.limit)[args.offset:]
    if len(rows) < args.limit:
        print(f"  only {len(rows)} rows available past offset {args.offset}")
    pb.validate_rows(rows)

    renderer = get_renderer(pb.RENDERER_NAME, tokenizer=get_tokenizer(pb.BASE_MODEL))

    print(f"Resolving a signed URL for {args.tinker_path}...")
    signed_url = await get_tinker_checkpoint_signed_url_async(
        tinker.ServiceClient(), args.tinker_path, ttl_seconds=args.ttl
    )
    print(f"  resolved ({len(signed_url)} chars); Sail fetches the archive itself")

    completer = SailTokenCompleter(
        model=pb.BASE_MODEL,
        max_tokens=MAX_TOKENS,
        temperature=args.temperature,
        completion_window=args.completion_window,
        tinker_lora_signed_url=signed_url,
        # Must describe the adapter Tinker actually trained. "all" rather than a
        # narrow module list: naming a subset would drop trained modules.
        adapter_config={
            "peft_type": "LORA",
            "r": args.rank,
            "lora_alpha": args.rank,
            "target_modules": "all",
            "task_type": "CAUSAL_LM",
        },
        tinker_lora_name="pokerbench-eval",
    )

    print(f"Sampling {len(rows)} hands on {pb.BASE_MODEL} + checkpoint "
          f"(window={args.completion_window}, concurrency={args.concurrency})")
    semaphore = asyncio.Semaphore(args.concurrency)

    async def ask(row: dict) -> tuple[dict, str | None]:
        async with semaphore:
            try:
                prompt = renderer.build_generation_prompt(pb.build_prompt(row["instruction"]))
                result = await completer(prompt, renderer.get_stop_sequences())
                message, _ = renderer.parse_response(result.tokens)
                return row, renderers.get_text_content(message)
            except Exception as error:
                # One failure must not discard a paid run.
                print(f"  request failed: {type(error).__name__}: {error}", file=sys.stderr)
                return row, None

    started = time.time()
    results = await asyncio.gather(*[ask(row) for row in rows])
    elapsed = time.time() - started

    exact = verb_only = unparsed = errors = 0
    verbs: Counter[str] = Counter()
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
            verbs[action.verb] += 1
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
    print(f"  predicted verbs: {dict(verbs.most_common())}")
    print("\nCompare against `python evaluate.py --limit "
          f"{args.limit} --offset {args.offset}` for the base model.")

    if examples:
        print("\nExamples (label -> completion):")
        for want, got in examples:
            print(f"  {want!r:16} -> {got!r}")


def main() -> None:
    args = parse_args()
    if not args.tinker_path.startswith("tinker://"):
        sys.exit(f"--tinker-path should look like tinker://<run-id>/sampler_weights/<name>, "
                 f"got {args.tinker_path!r}")
    require_keys()
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
