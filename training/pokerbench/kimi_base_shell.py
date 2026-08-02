"""Stand in for the 595 GB Kimi K2.6 checkpoint during adapter conversion.

`tinker_cookbook.weights.build_lora_adapter` needs the base model to remap
Tinker's internal LoRA weight names onto HuggingFace parameter names. It does
that through `resolve_model_dir(base_model)`, which calls `snapshot_download`
— and for `moonshotai/Kimi-K2.6` that is **595 GB across 64 shards** (measured
against the HF API), which no laptop is going to pull to convert a ~50 MB
adapter.

But look at what the conversion actually reads: `get_model_state_keys` and
`get_model_state_shapes`, both of which parse only safetensors *headers*, plus
`config.json`. It never touches a single weight value. And for Kimi the profile
has an empty `fused_projection_map`, so even the shapes go unused.

So we build a "shell": the real `config.json` (5 KB) plus one zero-length
tensor per parameter name, with the names taken from the real
`model.safetensors.index.json` (24 MB). The conversion cannot tell the
difference, and the download drops from 595 GB to ~24 MB.

Verified locally: a shell built this way drives `build_lora_adapter` to
completion on a rank-32 Kimi adapter and produces all 208,550 real parameter
names for key validation.
"""

from __future__ import annotations

import json
import urllib.request
from pathlib import Path

# Files we need from the HF repo. Both are LFS-tracked, so they must be fetched
# from `resolve/` rather than `raw/` — `raw/` returns the LFS pointer text, and
# json.loads on a pointer fails with a confusing "Expecting value" error.
_RESOLVE_URL = "https://huggingface.co/{model}/resolve/main/{path}"
_CONFIG_FILE = "config.json"
_INDEX_FILE = "model.safetensors.index.json"


def _fetch(model: str, path: str, dest: Path, token: str | None) -> Path:
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    url = _RESOLVE_URL.format(model=model, path=path)
    request = urllib.request.Request(url)
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(request) as response, open(dest, "wb") as handle:
        while chunk := response.read(1 << 20):
            handle.write(chunk)
    return dest


def parameter_names(model: str, cache_dir: Path, token: str | None = None) -> list[str]:
    """Every parameter name in the base model, from its safetensors index."""
    index_path = _fetch(model, _INDEX_FILE, cache_dir / _INDEX_FILE, token)
    index = json.loads(index_path.read_text())
    return list(index["weight_map"])


def build(model: str, output_dir: Path, token: str | None = None) -> Path:
    """Write a weightless stand-in for `model` and return its directory.

    The result is a directory `build_lora_adapter` accepts as `base_model`.
    """
    import numpy as np
    from safetensors.numpy import save_file

    output_dir.mkdir(parents=True, exist_ok=True)
    _fetch(model, _CONFIG_FILE, output_dir / _CONFIG_FILE, token)
    names = parameter_names(model, output_dir, token)

    shell = output_dir / "model.safetensors"
    if not shell.exists():
        # Zero-length tensors: the header carries the names, which is all the
        # conversion reads. safetensors requires each tensor to own its memory,
        # and empty arrays trivially do.
        save_file({name: np.zeros((0,), dtype=np.int8) for name in names}, str(shell))
    return output_dir


def resolves_against_base(peft_key: str, base_names: set[str]) -> bool:
    """Whether a PEFT LoRA key names a parameter that exists in the base model.

    A LoRA can only be applied to modules that exist, so this is the check that
    catches a wrong key prefix before an upload rather than after a failed
    validation.

    Kimi's routed experts are stored compressed-tensors `pack-quantized`, so the
    real parameter is `...weight_packed` rather than `...weight`; both count.
    """
    target = (
        peft_key.replace("base_model.model.", "", 1)
        .replace(".lora_A.weight", ".weight")
        .replace(".lora_B.weight", ".weight")
    )
    return target in base_names or f"{target.removesuffix('.weight')}.weight_packed" in base_names
