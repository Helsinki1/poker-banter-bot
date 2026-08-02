"""Tinker checkpoint -> PEFT adapter -> uploaded Sail LoRA the game can use.

    python export_and_upload.py \
        --tinker-path "tinker://<run-id>/sampler_weights/pokerbench-sft-final" \
        --name pokerbench-sft-v1

Why this step exists at all: a Tinker checkpoint is NOT usable from the app.
Sail's docs are explicit — "A plain text Responses or Chat Completions request
that happens to carry Tinker checkpoint metadata is served by the base model."
Tinker checkpoints only apply through sail.SailTokenCompleter, which speaks raw
token IDs, not chat messages.

An *uploaded* LoRA is different: pass its name as `metadata.lora` on any normal
chat-completions request and Sail serves the adapter. That is the path the
browser app can actually take, so this script converts the checkpoint into the
two standard PEFT files and registers them.

Two things here are not in the obvious version of this script, both because
converting a Kimi K2.6 adapter specifically needs them:

1. The base model is a 595 GB download, and `build_lora_adapter` fetches it.
   We hand it a weightless stand-in instead — see `kimi_base_shell`.
2. `build_lora_adapter` emits keys under `base_model.model.model.*`, but Kimi
   K2.6 is a VL model whose language weights live under
   `language_model.model.*`. Every key needs that prefix or the adapter targets
   modules that do not exist. See `_retarget_to_language_model`.

Both were found by running the conversion against real Kimi parameter names
rather than by reading the docs, and the key check runs on every conversion:
an adapter whose keys match nothing is refused rather than uploaded.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import tempfile
import time
from pathlib import Path

import kimi_base_shell
import pokerbench_data as pb

SAIL_BASE_URL = "https://api.sailresearch.com/v1"

# Sail's cap for Kimi K2.6 LoRAs. Above this, validation fails.
MAX_RANK = 32

# LoRA names are 2-64 chars, lowercase alphanumeric or dashes, starting and
# ending alphanumeric. Checked locally so a typo fails instantly instead of
# after a multi-GB upload.
NAME_PATTERN = re.compile(r"^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$")

# Kimi K2.6 (`model_type=kimi_k25`) wraps its text backbone under an *outer*
# `language_model.` prefix. tinker-cookbook's merge path knows this (see
# `_merge_kimi_k25`), but the PEFT adapter path does not apply it, so the keys
# it writes address `model.layers.*` when the real parameters are
# `language_model.model.layers.*`.
_PEFT_PREFIX = "base_model.model.model."
_PEFT_PREFIX_FIXED = "base_model.model.language_model.model."


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tinker-path", required=True,
                        help="tinker://<run-id>/sampler_weights/<name>")
    parser.add_argument("--name", required=True,
                        help="LoRA name to register on Sail (lowercase, dashes)")
    parser.add_argument("--display-name", default=None)
    parser.add_argument("--description",
                        default="Kimi K2.6 LoRA fine-tuned on RZ412/PokerBench.")
    parser.add_argument("--work-dir", default=None,
                        help="Where to stage the checkpoint (default: a temp dir)")
    parser.add_argument("--skip-upload", action="store_true",
                        help="Convert to PEFT and stop, without uploading")
    parser.add_argument("--poll-timeout", type=int, default=1800,
                        help="Seconds to wait for Sail validation")
    return parser.parse_args()


def require_key(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        sys.exit(f"Missing {name}.")
    return value


def _retarget_to_language_model(peft_dir: Path, base_names: set[str]) -> None:
    """Rewrite PEFT keys onto the parameter names Kimi K2.6 actually has.

    A LoRA whose keys name modules the model does not have applies to nothing.
    Depending on the serving stack that is either a hard load error or — worse —
    a silent no-op that looks like a fine-tune which learned nothing. So this
    checks every key against the real parameter list and refuses to upload an
    adapter it cannot account for.
    """
    from safetensors.torch import load_file, save_file

    weights_path = peft_dir / "adapter_model.safetensors"
    weights = load_file(str(weights_path))

    already_ok = sum(kimi_base_shell.resolves_against_base(k, base_names) for k in weights)
    if already_ok == len(weights):
        print(f"  keys: all {len(weights)} already target real parameters")
        return

    retargeted = {k.replace(_PEFT_PREFIX, _PEFT_PREFIX_FIXED, 1): v for k, v in weights.items()}
    resolved = sum(kimi_base_shell.resolves_against_base(k, base_names) for k in retargeted)
    if resolved != len(retargeted):
        unresolved = [k for k in retargeted if not kimi_base_shell.resolves_against_base(k, base_names)]
        sys.exit(
            f"{len(unresolved)} of {len(retargeted)} adapter keys do not match any "
            f"{pb.BASE_MODEL} parameter, e.g.\n  {unresolved[0]}\n"
            "Uploading this would produce a LoRA that applies to nothing. The key "
            "layout of either the checkpoint or the base model has changed."
        )

    save_file(retargeted, str(weights_path))
    print(f"  keys: retargeted all {len(retargeted)} onto language_model.* "
          f"({already_ok} already correct)")


def download_and_convert(
    tinker_path: str, work_dir: Path, hf_token: str | None
) -> tuple[Path, set[str]]:
    """Fetch the Tinker checkpoint and write PEFT adapter files.

    build_lora_adapter refuses to overwrite an existing directory, so the
    output path must not exist yet.
    """
    from tinker_cookbook import weights

    raw_dir = work_dir / "tinker-adapter"
    peft_dir = work_dir / "peft-adapter"
    shell_dir = work_dir / "kimi-shell"
    raw_dir.mkdir(parents=True, exist_ok=True)
    shutil.rmtree(peft_dir, ignore_errors=True)

    print(f"Downloading {tinker_path}...")
    adapter_dir = weights.download(tinker_path=tinker_path, output_dir=str(raw_dir))
    print(f"  extracted to {adapter_dir}")

    print(f"Building a weightless stand-in for {pb.BASE_MODEL} (the real one is ~595 GB)...")
    kimi_base_shell.build(pb.BASE_MODEL, shell_dir, hf_token)
    base_names = set(kimi_base_shell.parameter_names(pb.BASE_MODEL, shell_dir, hf_token))
    print(f"  {len(base_names)} base parameter names")

    print("Converting to PEFT format...")
    weights.build_lora_adapter(
        base_model=str(shell_dir),
        adapter_path=str(adapter_dir),
        output_path=str(peft_dir),
    )

    config_path = peft_dir / "adapter_config.json"
    weights_path = peft_dir / "adapter_model.safetensors"
    for path in (config_path, weights_path):
        if not path.exists():
            sys.exit(f"Conversion did not produce {path.name}; cannot upload.")

    _retarget_to_language_model(peft_dir, base_names)

    # The shell's local path leaks into the config as the base model name; Sail
    # matches the adapter against the model it is registered for, so name it.
    config = json.loads(config_path.read_text())
    config["base_model_name_or_path"] = pb.BASE_MODEL
    config_path.write_text(json.dumps(config, indent=2) + "\n")

    rank = config.get("r")
    print(f"  {config_path.name}: peft_type={config.get('peft_type')} r={rank} "
          f"task_type={config.get('task_type')} "
          f"target_modules={config.get('target_modules')}")
    print(f"  {weights_path.name}: {weights_path.stat().st_size / 1e6:.1f} MB")

    if isinstance(rank, int) and rank > MAX_RANK:
        sys.exit(f"Adapter rank {rank} exceeds Sail's limit of {MAX_RANK} for "
                 f"{pb.BASE_MODEL}; Sail would reject it at validation.")
    return peft_dir, base_names


def upload_and_register(peft_dir: Path, args: argparse.Namespace, api_key: str) -> dict:
    import requests
    from openai import OpenAI

    client = OpenAI(base_url=SAIL_BASE_URL, api_key=api_key)

    print("Uploading adapter_config.json...")
    with open(peft_dir / "adapter_config.json", "rb") as handle:
        config_file = client.files.create(file=handle, purpose="lora")
    print(f"  {config_file.id}")

    print("Uploading adapter_model.safetensors (this can take a while)...")
    with open(peft_dir / "adapter_model.safetensors", "rb") as handle:
        weights_file = client.files.create(file=handle, purpose="lora")
    print(f"  {weights_file.id}")

    print(f"Registering LoRA {args.name!r}...")
    payload = {
        "name": args.name,
        "supported_models": [pb.BASE_MODEL],
        "config_file_id": config_file.id,
        "weights_file_id": weights_file.id,
        "description": args.description,
    }
    if args.display_name:
        payload["display_name"] = args.display_name

    response = requests.post(
        f"{SAIL_BASE_URL}/loras",
        headers={"Authorization": f"Bearer {api_key}"},
        json=payload,
        timeout=60,
    )
    if response.status_code == 409:
        sys.exit(f"A LoRA named {args.name!r} already exists in this org. "
                 "Pick another name, or PATCH/delete the existing one.")
    response.raise_for_status()
    return response.json()


def poll_validation(name: str, api_key: str, timeout: int) -> str:
    """Wait for Sail to validate the LoRA against Kimi K2.6.

    Returns the final validation status. Only `failed` actually blocks
    inference — `pending`, `running`, and `unverified` all remain usable — so
    this is informational rather than a gate.
    """
    import requests

    deadline = time.time() + timeout
    last = ""
    while time.time() < deadline:
        response = requests.get(
            f"{SAIL_BASE_URL}/loras/{name}",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=30,
        )
        response.raise_for_status()
        body = response.json()
        records = [v for v in body.get("validations", []) if v.get("model") == pb.BASE_MODEL]
        status = records[0].get("status", "unknown") if records else "unknown"
        if status != last:
            print(f"  validation: {status}")
            last = status
        if status in ("succeeded", "failed", "unverified"):
            if status == "failed" and records:
                print(f"  reason: {records[0].get('result_message')}")
            return status
        time.sleep(10)
    print("  validation still pending; it may finish later.")
    return last or "pending"


def main() -> None:
    args = parse_args()
    if not NAME_PATTERN.match(args.name):
        sys.exit(f"Invalid LoRA name {args.name!r}: 2-64 chars, lowercase alphanumeric "
                 "or dashes, must start and end alphanumeric.")
    if not args.tinker_path.startswith("tinker://"):
        sys.exit(f"--tinker-path should look like tinker://<run-id>/sampler_weights/<name>, "
                 f"got {args.tinker_path!r}")

    require_key("TINKER_API_KEY")
    api_key = "" if args.skip_upload else require_key("SAIL_API_KEY")
    hf_token = os.environ.get("HF_TOKEN") or None

    with tempfile.TemporaryDirectory() as temp_dir:
        work_dir = Path(args.work_dir) if args.work_dir else Path(temp_dir)
        work_dir.mkdir(parents=True, exist_ok=True)
        peft_dir, _ = download_and_convert(args.tinker_path, work_dir, hf_token)

        if args.skip_upload:
            print(f"\n--skip-upload: PEFT adapter left at {peft_dir}")
            return

        lora = upload_and_register(peft_dir, args, api_key)
        print(f"  id={lora.get('id')} status={lora.get('status')}")
        status = poll_validation(args.name, api_key, args.poll_timeout)

    print("\nUse it in the game by adding to ../../.env:")
    print(f"  VITE_SAIL_LORA={args.name}")
    print("  VITE_LLM_MODEL=sail-kimi-k2.6-lora")
    print("\nLoRA requests cannot use completion_window=asap; the app sends "
          "`priority` automatically (~8.5s measured vs ~1.4s on asap).")
    if status == "failed":
        sys.exit("Validation failed — the adapter is not usable on this model.")


if __name__ == "__main__":
    main()
