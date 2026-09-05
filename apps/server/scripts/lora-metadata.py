#!/usr/bin/env python3
"""Extract LoRA trigger words from PyTorch .ckpt files (Draw Things format).

Modern torch.save() writes files as ZIP containers with a `data.pkl` entry
containing the metadata dict (with __metadata__). We read ONLY that pickle
without loading tensors, so the operation is fast and memory-efficient even
for multi-GB LoRA checkpoints.
"""

from __future__ import annotations

import json
import pickle
import sqlite3
import sys
import zipfile
from pathlib import Path

METADATA_KEYS = (
    "trained_words",
    "modelspec.trigger_phrase",
    "modelspec.trigger_words",
    "tags",
)
NAME_KEYS = ("modelspec.title", "modelspec.suffix", "name")

# Base model – stejná sada jako extractBaseModel() v lora-metadata.ts.
BASE_MODEL_KEYS = (
    "modelspec.architecture",
    "modelspec.sai_base_model",
    "ss_base_model_version",
    "ss_sd_model_name",
    "ssmd_base_model_version",
    "base_model",
    "baseModel",
)

SQLITE_MAGIC = b"SQLite format 3\x00"
ZIP_MAGIC = b"PK\x03\x04"


def extract_from_metadata(meta: object) -> dict:
    out_trigger: set[str] = set()
    name = None
    base_model = None

    if isinstance(meta, dict):
        for key in METADATA_KEYS:
            val = meta.get(key)
            if isinstance(val, str):
                for part in val.split(","):
                    word = part.strip()
                    if word:
                        out_trigger.add(word)
        for key in NAME_KEYS:
            val = meta.get(key)
            if isinstance(val, str) and val.strip():
                name = val.strip()
                break
        for key in BASE_MODEL_KEYS:
            val = meta.get(key)
            if isinstance(val, str) and val.strip():
                base_model = val.strip()
                break

    return {
        "triggerWords": sorted(out_trigger),
        "name": name,
        "baseModel": base_model,
    }


def extract_from_zip_pytorch(path: Path) -> dict:
    """Modern PyTorch format (torch.save ZIP container)."""
    if not zipfile.is_zipfile(str(path)):
        raise ValueError("Not a ZIP-based PyTorch file")

    with zipfile.ZipFile(str(path)) as zf:
        names = zf.namelist()
        pickle_names = [n for n in names if n.endswith(".pkl")]
        if not pickle_names:
            return extract_from_metadata({})

        pickle_name = (
            "archive/data.pkl"
            if "archive/data.pkl" in pickle_names
            else pickle_names[0]
        )

        with zf.open(pickle_name) as f:
            data = pickle.load(f)

    if not isinstance(data, dict):
        return extract_from_metadata({})

    if isinstance(data.get("__metadata__"), dict):
        return extract_from_metadata(data["__metadata__"])

    sd = data.get("state_dict")
    if isinstance(sd, dict) and isinstance(sd.get("__metadata__"), dict):
        return extract_from_metadata(sd["__metadata__"])

    return extract_from_metadata({})


def extract_from_sqlite(path: Path) -> dict:
    """Draw Things native SQLite format. Metadata lives in sidecar custom_lora.json."""
    if not path.exists():
        raise ValueError("File not found")
    with open(path, "rb") as f:
        magic = f.read(len(SQLITE_MAGIC))
    if magic != SQLITE_MAGIC:
        raise ValueError("Not a SQLite file")

    custom_json = path.parent / "custom_lora.json"
    if not custom_json.exists():
        return {"triggerWords": [], "name": None, "baseModel": None}

    try:
        with open(custom_json, encoding="utf-8") as f:
            entries = json.load(f)
    except (OSError, json.JSONDecodeError):
        return {"triggerWords": [], "name": None, "baseModel": None}

    if not isinstance(entries, list):
        return {"triggerWords": [], "name": None, "baseModel": None}

    file_name = path.name
    for entry in entries:
        if not isinstance(entry, dict) or entry.get("file") != file_name:
            continue
        prefix = entry.get("prefix")
        name = entry.get("name")
        trigger_words: list[str] = []
        if isinstance(prefix, str):
            for word in prefix.split():
                word = word.strip()
                if word:
                    trigger_words.append(word)
        return {
            "triggerWords": trigger_words,
            "name": name if isinstance(name, str) else None,
            "baseModel": None,
        }

    return {"triggerWords": [], "name": None, "baseModel": None}


def detect_and_extract(path: Path) -> dict:
    with open(path, "rb") as f:
        magic = f.read(4)

    if magic == SQLITE_MAGIC[:4]:
        return extract_from_sqlite(path)
    if magic == ZIP_MAGIC:
        return extract_from_zip_pytorch(path)

    # Native safetensors is handled by the Node.js side.
    # Fall through: try ZIP/PyTorch as best-effort.
    return extract_from_zip_pytorch(path)


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: lora-metadata.py <file>", file=sys.stderr)
        return 2

    path = Path(sys.argv[1])
    if not path.exists():
        print(f"File not found: {path}", file=sys.stderr)
        return 3

    try:
        result = detect_and_extract(path)
        print(json.dumps(result))
        return 0
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())