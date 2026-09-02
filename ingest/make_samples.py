"""Rebuild data/samples + data/manifests for offline development.

Uses live sources where they need no key and are small (GDACS, USGS latest, NWPS, Open-Meteo,
GWW sample reservoirs, GDO CDI, UNL GRACE-DA percentile, Natural Earth, WGMS regional CSVs).
Run: `uv run python cli.py samples` from ingest/.
"""

from __future__ import annotations

import logging
import os
import pathlib
import shutil
import sys
from datetime import UTC, datetime

from common.config import FIXTURES_DIR, MANIFESTS_DIR, SAMPLES_DIR, PipelineConfig
from common.manifest import (
    ArtifactRef,
    read_layer_manifest,
    write_layer_manifest,
    write_root_manifest,
)
from pipelines import LAYER_OF, get_pipeline

log = logging.getLogger("samples")

ORDER = [
    "rivers",
    "discharge_openmeteo",
    "gauges_noaa",
    "gauges_usgs",
    "events_gdacs",
    "reservoirs_gww",
    "glaciers_rgi",
    "drought_gdo",
    "groundwater_grace",
]


def main(only_list: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    only = set(only_list) if only_list else (set(sys.argv[1:]) if len(sys.argv) > 1 else None)
    SAMPLES_DIR.mkdir(parents=True, exist_ok=True)
    now = datetime.now(UTC)
    os.environ.setdefault("USGS_TASK", "latest")
    for name in ORDER:
        if only and name not in only:
            continue
        layer = LAYER_OF[name]
        previous = read_layer_manifest(layer, MANIFESTS_DIR) or {}
        cfg = PipelineConfig.from_env(SAMPLES_DIR, publish=False, sample=True, now=now)
        cfg.previous_versions = []
        if name == "glaciers_rgi":
            cfg.fixtures["wgms_regions_dir"] = FIXTURES_DIR / "wgms_regions"
        # Optional offline input for USGS latest pages (raw OGC responses), e.g. when the API is degraded.
        fixture_dir = os.environ.get("USGS_LATEST_FIXTURES")
        if name == "gauges_usgs" and fixture_dir:
            base = pathlib.Path(fixture_dir)
            cfg.fixtures["usgs_latest_discharge"] = base / "usgs_latest_00060_p1.json"
            cfg.fixtures["usgs_latest_stage"] = base / "usgs_latest_00065_p1.json"
        log.info("== sample %s", name)
        try:
            manifest = get_pipeline(name)(cfg)
        except Exception:
            log.exception("sample pipeline %s failed", name)
            continue
        manifest.sample = True
        # keep sibling artifacts (rivers <- discharge, gauges <- noaa) from this same run
        if previous.get("artifacts") and previous.get("version") == cfg.version:
            mine = {a.name for a in manifest.artifacts}
            kept = False
            for a in previous["artifacts"]:
                if a.get("name") not in mine:
                    kept = True
                    manifest.artifacts.append(ArtifactRef(**a))
            if kept:
                for n in previous.get("notes", []):
                    if n not in manifest.notes:
                        manifest.notes.append(n)
        write_layer_manifest(manifest, MANIFESTS_DIR)
    write_root_manifest(MANIFESTS_DIR, now)
    # git only keeps `latest/`: drop the versioned copies and caches
    for layer_dir in SAMPLES_DIR.iterdir():
        if not layer_dir.is_dir() or layer_dir.name.startswith("."):
            continue
        for v in layer_dir.iterdir():
            if v.is_dir() and v.name != "latest":
                shutil.rmtree(v)
    for junk in (".cache", ".tmp"):
        shutil.rmtree(SAMPLES_DIR / junk, ignore_errors=True)
    # rewrite manifest URLs from <layer>/<version>/ to <layer>/latest/ (sample mode only)
    import json
    import re

    for p in MANIFESTS_DIR.glob("*.json"):
        text = p.read_text(encoding="utf-8")
        text = re.sub(r'"url": "([a-z]+)/\d{8}T\d{4}/', r'"url": "\1/latest/', text)
        p.write_text(text, encoding="utf-8")
        json.loads(text)
    write_root_manifest(MANIFESTS_DIR, now)
    log.info("samples in %s, manifests in %s", SAMPLES_DIR, MANIFESTS_DIR)
    return 0


if __name__ == "__main__":
    sys.exit(main())
