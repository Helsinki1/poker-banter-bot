"""Supervised fine-tune a Kimi K2.6 LoRA on PokerBench, via Tinker.

    python sft.py --limit 8 --batch-size 4 --smoke-test   # cheap dry run
    python sft.py --limit 4096 --batch-size 32 --epochs 1

Prints the Tinker checkpoint path on completion; feed that to
export_and_upload.py to serve it on Sail.

Tinker owns the optimizer; nothing trains locally. Each step is
forward_backward (accumulate gradients) then optim_step (apply them), which is
the loop the Tinker API exposes.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys

import pokerbench_data as pb

# Default LoRA rank. Sail caps Kimi K2.6 LoRAs at rank 32, so this is both the
# default and the ceiling — export_and_upload.py would fail validation above it.
MAX_RANK = 32


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=4096,
                        help="PokerBench rows to train on (563k available)")
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--epochs", type=int, default=1)
    parser.add_argument("--rank", type=int, default=MAX_RANK,
                        help=f"LoRA rank (Sail serves Kimi K2.6 up to {MAX_RANK})")
    parser.add_argument("--learning-rate", type=float, default=1e-4)
    parser.add_argument("--max-length", type=int, default=2048,
                        help="Token cap per example; PokerBench prompts are ~500 tokens")
    parser.add_argument("--checkpoint-name", default="pokerbench-sft-final")
    parser.add_argument("--checkpoint-ttl", type=int, default=7 * 24 * 3600,
                        help="Seconds before Tinker expires the checkpoint")
    parser.add_argument("--smoke-test", action="store_true",
                        help="Render the data and stop before any training call")
    return parser.parse_args()


def require_keys(*, need_tinker: bool = True) -> None:
    """Fail before doing real work, not part-way through a paid run."""
    missing = [
        name for name, needed in (("TINKER_API_KEY", need_tinker), ("SAIL_API_KEY", False))
        if needed and not os.environ.get(name)
    ]
    if missing:
        sys.exit(
            f"Missing {', '.join(missing)}.\n"
            "Tinker and Sail are separate services with separate keys.\n"
            "  export TINKER_API_KEY=...   # https://thinkingmachines.ai/tinker\n"
            "  export SAIL_API_KEY=sk_...  # same key as VITE_SAIL_API_KEY in ../../.env"
        )


def build_datums(rows: list[dict], *, max_length: int) -> list:
    """Tokenize PokerBench rows into Tinker training datums.

    Loss lands only on the assistant tokens (the action). Training on the
    prompt too would spend the whole budget learning to reproduce PokerBench's
    scenario boilerplate instead of learning to decide.
    """
    from tinker_cookbook.renderers import TrainOnWhat, get_renderer
    from tinker_cookbook.supervised.data import conversation_to_datum
    from tinker_cookbook.tokenizer_utils import get_tokenizer

    renderer = get_renderer(pb.RENDERER_NAME, tokenizer=get_tokenizer(pb.BASE_MODEL))
    return [
        conversation_to_datum(
            pb.build_conversation(row),
            renderer,
            max_length=max_length,
            train_on_what=TrainOnWhat.ALL_ASSISTANT_MESSAGES,
        )
        for row in rows
    ]


async def train(args: argparse.Namespace) -> str:
    import tinker
    from tinker import types

    if args.rank > MAX_RANK:
        sys.exit(
            f"--rank {args.rank} exceeds the rank {MAX_RANK} Sail serves for "
            f"{pb.BASE_MODEL}; the adapter would train fine and then fail LoRA validation."
        )

    print(f"Loading {args.limit} rows from {pb.DATASET_ID}...")
    rows = pb.load_rows(split="train", limit=args.limit)
    pb.validate_rows(rows)
    print(f"  {len(rows)} rows validated")

    print(f"Tokenizing with renderer {pb.RENDERER_NAME}...")
    datums = build_datums(rows, max_length=args.max_length)
    lengths = [len(d.model_input.to_ints()) for d in datums]
    print(f"  {len(datums)} datums | tokens: min {min(lengths)}, "
          f"mean {sum(lengths) // len(lengths)}, max {max(lengths)}")

    if args.smoke_test:
        print("\n--smoke-test: data pipeline OK, stopping before any training call.")
        print(f"Sample prompt:\n{rows[0]['instruction'][:300]}...")
        print(f"Sample label: {rows[0]['output']!r}")
        return ""

    service_client = tinker.ServiceClient()
    training_client = await service_client.create_lora_training_client_async(
        base_model=pb.BASE_MODEL,
        rank=args.rank,
    )
    print(f"Training client ready: {pb.BASE_MODEL} @ rank {args.rank}")

    steps_per_epoch = max(1, len(datums) // args.batch_size)
    total_steps = steps_per_epoch * args.epochs
    print(f"{args.epochs} epoch(s) x {steps_per_epoch} steps = {total_steps} optimizer steps")

    step = 0
    for epoch in range(args.epochs):
        for index in range(steps_per_epoch):
            batch = datums[index * args.batch_size : (index + 1) * args.batch_size]
            if not batch:
                continue
            fwd_bwd = await training_client.forward_backward_async(
                data=batch,
                loss_fn="cross_entropy",
            )
            result = await fwd_bwd.result_async()
            await (
                await training_client.optim_step_async(
                    types.AdamParams(learning_rate=args.learning_rate)
                )
            ).result_async()

            step += 1
            nll = _mean_nll(result, batch)
            suffix = f" | nll {nll:.4f}" if nll is not None else ""
            print(f"  epoch {epoch} step {step}/{total_steps}{suffix}")

    print(f"Saving sampler weights as {args.checkpoint_name!r}...")
    save = await training_client.save_weights_for_sampler_async(
        args.checkpoint_name,
        ttl_seconds=args.checkpoint_ttl,
    )
    path = (await save.result_async()).path
    print(f"\nCheckpoint: {path}")
    print("Serve it in the game with:\n"
          f"  python export_and_upload.py --tinker-path '{path}' --name pokerbench-sft-v1")
    return path


def _mean_nll(result, batch) -> float | None:
    """Weighted mean negative log-likelihood for the batch, for progress output.

    Uses the cookbook's own helper so the number means the same thing it does in
    tinker-cookbook's training logs. Diagnostic only: a shape change here must
    not kill an otherwise healthy (and paid-for) training run.
    """
    try:
        from tinker_cookbook.supervised.common import compute_mean_nll

        logprobs = [output["logprobs"] for output in result.loss_fn_outputs]
        weights = [datum.loss_fn_inputs["weights"] for datum in batch]
        return compute_mean_nll(logprobs, weights)
    except Exception:
        return None


def main() -> None:
    args = parse_args()
    require_keys(need_tinker=not args.smoke_test)
    asyncio.run(train(args))


if __name__ == "__main__":
    main()
