"""Seed a fresh CI working directory with the artifacts earlier (slower) pipelines published.

Every scheduled run starts from an empty checkout, so without this the 15-minute gauge job would
never see the weekly station names and percentile tables, and the daily discharge job would have
no river points. Each entry is optional: a 404 simply means that pipeline has not run yet.

    uv run python restore.py --out ./.out [names...]
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import httpx

REPO_ROOT = Path(__file__).resolve().parents[1]

# name -> (key in the bucket, optional local sample to fall back to)
ARTIFACTS: dict[str, tuple[str, Path | None]] = {
    "river-points": (
        "rivers/latest/points.json",
        REPO_ROOT / "data" / "samples" / "rivers" / "latest" / "points.json",
    ),
    "gauge-stations": ("gauges/latest/stations.parquet", None),
    "gauge-stats": ("gauges/latest/stats.json", None),
    "gauge-noaa": ("gauges/latest/noaa.json", None),
}


def restore(name: str, out_dir: Path, base: str | None, client: httpx.Client) -> str:
    key, sample = ARTIFACTS[name]
    dest = out_dir / key
    if dest.exists():
        return "already present"
    if base:
        r = client.get(f"{base.rstrip('/')}/{key}")
        if r.status_code == 200:
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(r.content)
            return f"restored {len(r.content)} bytes"
        if r.status_code != 404:
            r.raise_for_status()
    if sample and sample.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(sample.read_bytes())
        return "not published yet, using the bundled sample"
    return "not published yet, skipped"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="restore")
    parser.add_argument("names", nargs="*", help=f"one or more of: {', '.join(ARTIFACTS)}")
    parser.add_argument("--out", default=".out")
    args = parser.parse_args(argv)

    names = args.names or list(ARTIFACTS)
    unknown = [n for n in names if n not in ARTIFACTS]
    if unknown:
        parser.error(f"unknown artifact(s): {', '.join(unknown)}")

    out_dir = Path(args.out)
    base = os.environ.get("R2_PUBLIC_URL")
    if not base:
        print("R2_PUBLIC_URL unset: only local samples are available", file=sys.stderr)
    with httpx.Client(timeout=120, follow_redirects=True) as client:
        for name in names:
            print(f"{name}: {restore(name, out_dir, base, client)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
