"""Fetch rivers/latest/points.json from the published bucket so discharge_openmeteo can run
in a fresh CI checkout (the rivers pipeline only runs monthly)."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import httpx


def main() -> int:
    base = os.environ.get("R2_PUBLIC_URL")
    out = Path(os.environ.get("INGEST_OUT", ".out")) / "rivers" / "latest" / "points.json"
    if out.exists():
        return 0
    if not base:
        # offline / fork without a bucket: fall back to the sample points
        sample = (
            Path(__file__).resolve().parents[1]
            / "data"
            / "samples"
            / "rivers"
            / "latest"
            / "points.json"
        )
        if sample.exists():
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(sample.read_bytes())
            return 0
        print("no R2_PUBLIC_URL and no sample points", file=sys.stderr)
        return 1
    r = httpx.get(
        f"{base.rstrip('/')}/rivers/latest/points.json", timeout=120, follow_redirects=True
    )
    r.raise_for_status()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(r.content)
    return 0


if __name__ == "__main__":
    sys.exit(main())
