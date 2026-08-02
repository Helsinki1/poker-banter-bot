# PokerBench LoRA — train with Tinker, serve on Sail

Fine-tunes a LoRA adapter on [`RZ412/PokerBench`](https://huggingface.co/datasets/RZ412/PokerBench)
with [Tinker](https://thinkingmachines.ai/tinker), then serves it through Sail
Research so the game can use it.

Two things live here, and it's worth being clear about which is which:

- **SFT** (`sft.py`) — imitate PokerBench's optimal action for a scenario.
  This is what the dataset is natively shaped for.
- **RL** (`rl.py`) — GRPO-style loop that grades the model's action against
  PokerBench's label, with rollouts sampled on Sail.

## Results (2026-08-02)

SFT run: 4,096 rows, 128 steps, batch 32, lr 1e-4, rank 32. NLL 5.23 → ~0.15.

Scored on 60 held-out rows (offset 500,000 — training starts from row 0), base
model versus the same checkpoint, identical rows and prompts:

| metric | base Kimi K2.6 | + PokerBench LoRA |
| --- | --- | --- |
| exact (verb + size) | 40.0% | **71.7%** |
| verb-only | 45.0% | 73.3% |
| unparsed | 40.0% | **5.0%** |

The `unparsed` collapse is the clearest single effect: the base model answers in
prose ("Raise to 3.5 chips.", "All in"), while the tuned model emits `raise 3`.

An 8-hand pilot of the same checkpoint read 87.5% exact. The 60-hand number is
71.7%. Small samples here are optimistic — don't quote fewer than ~60 rows.

Checkpoint from that run (TTL 7 days, so expired after ~2026-08-09):

```
tinker://a72b7ed4-78e4-5d37-b2a4-2f5454465e70:train:0/sampler_weights/pokerbench-sft-v1
```

Separately verified: the tuned model still produces in-character banter and did
**not** collapse into only emitting 1-3 token poker actions — the plausible
failure mode for SFT on labels this short.

## The constraint that shapes everything

Sail serves a LoRA two different ways, and only one of them is reachable from
the browser app:

| Path | How | Usable from the app? |
| --- | --- | --- |
| Tinker checkpoint | `sail.SailTokenCompleter(tinker_lora_signed_url=…)` | **No** |
| Uploaded PEFT LoRA | `metadata.lora` on chat completions | **Yes** |

Sail's docs are explicit about why: *"A plain text Responses or Chat Completions
request that happens to carry Tinker checkpoint metadata is served by the base
model."* A Tinker checkpoint only applies on Sail's raw-token sampling path,
which takes token IDs in and out — not a chat request.

So the app path is **export → upload → `metadata.lora`**, which is what
`export_and_upload.py` does. `SailTokenCompleter` is still the right tool
*during* RL training (that's what `rl.py` uses for rollouts), just not for
serving the game.

Verified against the live API rather than assumed:

```
metadata.completion_window=asap  + lora  →  400 "lora requests cannot use completion_window=asap"
metadata.completion_window=priority + unknown lora → 404 "lora not found: <name>"
```

**LoRA requests cannot use `asap`.** Measured on Kimi K2.6 with reasoning off:
`asap` returns in ~1.4s, while LoRA/checkpoint requests on `priority` took
**5.7-12.7s** per request across runs (8.5s for plain `priority` without a
LoRA). So turning on a LoRA costs several seconds per request, and there is no
streaming on the `SailTokenCompleter` path — the completion arrives whole. That
is why the adapter suits the poker *decision* better than live trash talk; see
"Where this belongs" below.

Kimi K2.6 is currently the **only** base model Sail serves LoRAs for
(max rank 32, all target modules).

## Where this belongs in the game

PokerBench teaches *poker decisions* ("bet 18", "fold"), not banter. The two
natural homes are different:

- **`src/game/ai.ts`** — the opponent's action choice. The file already notes it
  is "deliberately replaceable by a backend decision service later — same
  inputs, same PokerAction output." A PokerBench-tuned model is precisely that
  service, and it tolerates `priority` latency far better than speech does,
  because a poker opponent is *expected* to take time thinking.
- **Banter** would need a trash-talk dataset, not PokerBench. Nothing here
  makes the NPC funnier.

The app-side support added alongside this folder covers the banter backend: set
`VITE_SAIL_LORA` and any *uploaded* LoRA becomes selectable in the dock. Wiring
the decision path in `src/game/ai.ts` is not done yet.

As of 2026-08-02 the trained checkpoint is **not** uploaded (see the disk
requirement under "Serve it in the game"), so the app cannot reach it yet;
`evaluate_checkpoint.py` is how the tuned model is exercised in the meantime.

## Setup

```bash
python3.11 -m venv .venv && source .venv/bin/activate   # 3.11+ required
pip install -r requirements.txt

export SAIL_API_KEY=sk_...        # same key as VITE_SAIL_API_KEY in ../../.env
export TINKER_API_KEY=...
export HF_TOKEN=...               # PokerBench is a public dataset; HF_TOKEN
                                  # avoids anonymous rate limits
```

Tinker and Sail are separate services with separate keys and separate billing.
Tinker access is invite-gated; `sft.py` fails fast with a clear message if the
key is missing rather than part-way through a training run.

## Train

```bash
# Smoke test first — 8 examples, confirms both APIs and the data pipeline
# without spending a real training budget.
python sft.py --limit 8 --batch-size 4 --smoke-test

# A real short run.
python sft.py --limit 4096 --batch-size 32 --epochs 1
```

`sft.py` prints the Tinker checkpoint path on completion:

```
tinker://<run-id>/sampler_weights/pokerbench-sft-final
```

RL instead (slower and more expensive — every rollout is a Sail request):

```bash
python rl.py --steps 8 --groups-per-step 8 --group-size 4
```

## Serve it in the game

```bash
python export_and_upload.py \
  --tinker-path "tinker://<run-id>/sampler_weights/pokerbench-sft-final" \
  --name pokerbench-sft-v1
```

That downloads the Tinker checkpoint, converts it to PEFT format
(`adapter_config.json` + `adapter_model.safetensors`), uploads both to Sail,
registers the LoRA, and polls validation.

**Disk requirement, measured:** the checkpoint archive for a rank-32 Kimi
adapter is **18.78 GB**, and the conversion needs the extracted copy plus the
PEFT output on top of that — budget ~40 GB free. The 2026-08-02 run failed here
with `OSError: [Errno 28] No space left on device` on a machine with 7.9 GB
free. That is a disk limit, not a code problem; nothing about the script needs
fixing to get past it. To evaluate a checkpoint without any of that, use
`evaluate_checkpoint.py` (below), which downloads nothing.

Then in `../../.env`:

```
VITE_SAIL_LORA=pokerbench-sft-v1
VITE_LLM_MODEL=sail-kimi-k2.6-lora
```

The app sends `metadata.lora` and automatically drops to `priority`, since
`asap` is rejected for LoRA requests.

## Evaluate

Two scripts, because the two serving paths are not interchangeable:

```bash
# Chat completions — base model, or an already-uploaded LoRA.
python evaluate.py --limit 60                             # base model
python evaluate.py --limit 60 --lora pokerbench-sft-v1    # after upload

# SailTokenCompleter — a Tinker checkpoint, straight from a signed URL.
# Downloads nothing: no 18.78 GB archive, no upload step.
python evaluate_checkpoint.py \
  --tinker-path "tinker://<run-id>/sampler_weights/pokerbench-sft-v1" --limit 60
```

Do not score a checkpoint with `evaluate.py`. A chat-completions request
carrying checkpoint metadata is served by the **base** model, so it would
silently measure untuned Kimi and report it as the fine-tune.

Both report exact-match action accuracy and verb-only accuracy (right decision,
wrong sizing) on a held-out slice. Run against the base model *before* training
too — a fine-tune you can't compare to the base model tells you nothing.

## Files

| File | What it does |
| --- | --- |
| `pokerbench_data.py` | Loads PokerBench, renders it to Kimi chat format, parses actions |
| `sft.py` | Supervised fine-tune via Tinker |
| `rl.py` | GRPO-style RL, rollouts sampled on Sail |
| `export_and_upload.py` | Tinker checkpoint → PEFT → uploaded Sail LoRA (needs ~40 GB free) |
| `kimi_base_shell.py` | Weightless stand-in for the 595 GB Kimi base model, so conversion needs no giant download |
| `evaluate.py` | Accuracy of base vs *uploaded* LoRA, over chat completions |
| `evaluate_checkpoint.py` | Accuracy of a Tinker *checkpoint* via `SailTokenCompleter`, no download |
| `adapter_config.example.json` | PEFT config for Kimi K2.6 at rank 32 |

## Two Kimi-specific conversion fixes

Both found by running the conversion against Kimi's real parameter names rather
than from the docs, and both live in `export_and_upload.py` / `kimi_base_shell.py`:

1. **`build_lora_adapter` wants the base model, which is 595 GB.** But the
   conversion only reads safetensors *headers* plus `config.json` — never a
   weight value — and Kimi's merge profile leaves `fused_projection_map` empty,
   so even the shapes go unused. `kimi_base_shell.py` builds a 24 MB weightless
   directory carrying all 208,550 real parameter names instead.
2. **`build_lora_adapter` emits the wrong key prefix for Kimi K2.6.** It writes
   `base_model.model.model.layers.*`, but Kimi is a VL model whose text weights
   sit under an outer `language_model.` prefix. Measured 0 of 26 keys resolving
   before the fix, 26 of 26 after. `tinker_cookbook`'s *merge* path knows this
   (`_merge_kimi_k25`); its *adapter* path does not.

A mis-keyed LoRA can fail silently — applying to nothing looks like a fine-tune
that learned nothing rather than an error — so the key check runs on every
conversion and refuses to upload an adapter it cannot account for.

Note also that Kimi's routed experts are compressed-tensors `pack-quantized`:
the real parameter is `...weight_packed`, not `...weight` (207,360 of 208,550
keys are expert keys; zero are bare `.weight`), so key validation accepts both.

## Cost warning

Every RL rollout and every `evaluate.py` row is a billed Sail request, and
training steps are billed by Tinker. Start with `--limit 8 --smoke-test`. The
defaults here are deliberately small.
