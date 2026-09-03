"""Seed the bucket with `data/samples` so every layer resolves from day one.

The committed sample manifests use bucket-relative artifact URLs (`rivers/latest/spine.geojson`),
so uploading `data/samples/<layer>/…` to the bucket root makes them resolve. Those layers keep
`sample: true` and the UI keeps showing the "sample data" badge (spec §2.1: never drop a layer
because its source is unavailable — leave it working and flag it). Real pipeline runs overwrite
these keys and flip the flag.

    R2_* env set:  uv run python seed_samples.py [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import sys
from pathlib import Path

import httpx

from common.config import SAMPLES_DIR
from common.storage import Storage  # registers the geo mime types

SKIP_DIRS = {".cache", ".tmp"}
# The offline basemap ships with the web bundle, not the data bucket.
SKIP_TOP = {"basemap"}
# Top-level sample directory -> the layer whose manifest governs it.
LAYER_OF_DIR = {"discharge": "rivers"}


def published_real_layers(base: str | None) -> set[str]:
    """Layers already published from real sources; their keys must never be overwritten."""
    if not base:
        return set()
    try:
        r = httpx.get(f"{base.rstrip('/')}/manifest.json", timeout=60, follow_redirects=True)
    except httpx.HTTPError:
        return set()
    if r.status_code != 200:
        return set()
    try:
        layers = json.loads(r.text).get("layers", {})
    except json.JSONDecodeError:
        return set()
    return {k for k, v in layers.items() if not v.get("sample")}


def iter_sample_files(skip_layers: set[str] = frozenset()) -> list[tuple[Path, str]]:
    out: list[tuple[Path, str]] = []
    for path in sorted(SAMPLES_DIR.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(SAMPLES_DIR)
        parts = rel.parts
        if parts[0] in SKIP_TOP or any(p in SKIP_DIRS for p in parts):
            continue
        if LAYER_OF_DIR.get(parts[0], parts[0]) in skip_layers:
            continue
        out.append((path, "/".join(parts)))
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="seed_samples")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    skip = published_real_layers(os.environ.get("R2_PUBLIC_URL"))
    if skip:
        print(f"already live, not overwriting: {', '.join(sorted(skip))}", file=sys.stderr)
    files = iter_sample_files(skip)
    total = sum(p.stat().st_size for p, _ in files)
    print(f"{len(files)} files, {total / 1e6:.1f} MB", file=sys.stderr)
    if args.dry_run:
        for _, key in files:
            print(f"  {key}")
        return 0

    bucket = os.environ.get("R2_BUCKET")
    if not bucket:
        print("R2_BUCKET unset", file=sys.stderr)
        return 1
    storage = Storage(SAMPLES_DIR, os.environ.get("R2_PUBLIC_URL"), publish=True)
    client = storage._client()
    for path, key in files:
        ctype = mimetypes.guess_type(key)[0] or "application/octet-stream"
        client.upload_file(
            str(path),
            bucket,
            key,
            ExtraArgs={"ContentType": ctype, "CacheControl": "public, max-age=300"},
        )
        print(f"  uploaded {key} ({path.stat().st_size} bytes)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
