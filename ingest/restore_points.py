"""Fetch rivers/latest/points.json from the published bucket so discharge_openmeteo can run
in a fresh CI checkout (the rivers pipeline only runs monthly)."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import httpx

SAMPLE_POINTS = (
    Path(__file__).resolve().parents[1] / "data" / "samples" / "rivers" / "latest" / "points.json"
)


def main() -> int:
    base = os.environ.get("R2_PUBLIC_URL")
    out = Path(os.environ.get("INGEST_OUT", ".out")) / "rivers" / "latest" / "points.json"
    if out.exists():
        return 0
    if not base:
        # offline / fork without a bucket: fall back to the sample points
        sample = SAMPLE_POINTS
        if sample.exists():
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(sample.read_bytes())
            return 0
        print("no R2_PUBLIC_URL and no sample points", file=sys.stderr)
        return 1
    r = httpx.get(
        f"{base.rstrip('/')}/rivers/latest/points.json", timeout=120, follow_redirects=True
    )
    if r.status_code == 404:
        # The rivers pipeline (monthly) has not published yet: fall back to the sample points so
        # the daily discharge run still produces a usable layer.
        sample = SAMPLE_POINTS
        if not sample.exists():
            print(
                "rivers/latest/points.json missing in R2 and no sample available", file=sys.stderr
            )
            return 1
        print("rivers points not in R2 yet; using the sample points", file=sys.stderr)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(sample.read_bytes())
        return 0
    r.raise_for_status()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(r.content)
    return 0


if __name__ == "__main__":
    sys.exit(main())
