"""NOAA National Water Prediction Service gauges -> gauges/noaa.json (flood categories).

The output is a lookup keyed by USGS id consumed by gauges_usgs (same live workflow) and by
the web app for stations that exist only in NWPS.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from common.config import PipelineConfig, iso
from common.fetch import Fetcher
from common.manifest import ArtifactRef, LayerManifest
from common.pipeline import load_fixture_or, tmp_dir, versions_with, write_json
from common.storage import Storage
from common.units import ft_to_m, kcfs_to_m3s

log = logging.getLogger(__name__)

GAUGES_URL = "https://api.water.noaa.gov/nwps/v1/gauges"
FLOOD_MAP = {
    "no_flooding": "none",
    "action": "action",
    "minor": "minor",
    "moderate": "moderate",
    "major": "major",
}
MISSING = -999

ATTRIBUTION = {
    "name": "NOAA National Weather Service — National Water Prediction Service",
    "url": "https://water.noaa.gov",
    "license": "U.S. public domain",
}


def _valid_time(s: str | None) -> str | None:
    if not s or s.startswith("0001-01-01"):
        return None
    return iso(datetime.fromisoformat(s.replace("Z", "+00:00")))


def normalize(raw: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for g in raw.get("gauges", []):
        status = g.get("status") or {}
        obs = status.get("observed") or {}
        fc = status.get("forecast") or {}
        cat_raw = str(obs.get("floodCategory") or "")
        rec: dict[str, Any] = {
            "lid": g.get("lid"),
            "usgsId": (g.get("usgsId") or "").strip() or None,
            "name": g.get("name"),
            "lat": g.get("latitude"),
            "lon": g.get("longitude"),
            "floodCategory": FLOOD_MAP.get(cat_raw, "none"),
            "floodCategoryRaw": cat_raw,
        }
        obs_time = _valid_time(obs.get("validTime"))
        if obs_time and obs.get("primary") not in (None, MISSING):
            if obs.get("primaryUnit") == "ft":
                rec["stageM"] = round(ft_to_m(float(obs["primary"])), 3)
            rec["observedAt"] = obs_time
        if obs_time and obs.get("secondary") not in (None, MISSING):
            unit = obs.get("secondaryUnit")
            if unit == "kcfs":
                rec["dischargeM3s"] = round(kcfs_to_m3s(float(obs["secondary"])), 3)
            elif unit == "cfs":
                rec["dischargeM3s"] = round(float(obs["secondary"]) * 0.028316846592, 3)
        fc_time = _valid_time(fc.get("validTime"))
        fc_cat = str(fc.get("floodCategory") or "")
        if fc_time and fc_cat in FLOOD_MAP:
            rec["forecastFloodCategory"] = FLOOD_MAP[fc_cat]
            rec["forecastAt"] = fc_time
        if rec["lid"] and rec["lat"] is not None and rec["lon"] is not None:
            out.append(rec)
    return out


def run(cfg: PipelineConfig) -> LayerManifest:
    layer = "gauges"
    # NWPS returns 13 MB and 504s often; two quick attempts, then leave the previous
    # noaa.json in place rather than burning the whole scheduled-run budget.
    with Fetcher(cache_dir=cfg.out_dir / ".cache", per_second=2, timeout=180, retries=2) as fetcher:
        raw = load_fixture_or(
            cfg, "nwps_gauges", lambda: fetcher.get_json(GAUGES_URL, use_cache=False)
        )
    records = normalize(raw)
    by_usgs = {r["usgsId"]: r for r in records if r.get("usgsId")}
    newest = max((r.get("observedAt") or "" for r in records), default="") or iso(cfg.now)
    doc = {
        "generatedAt": iso(cfg.now),
        "count": len(records),
        "gauges": records,
    }
    tmp = tmp_dir(cfg, "gauges_noaa")
    path = write_json(tmp / "noaa.json", doc)
    storage = Storage(cfg.out_dir, cfg.public_base_url, cfg.publish)
    stored = storage.put(path, layer, cfg.version, "noaa.json", cache_seconds=300)
    log.info("nwps gauges: %d (%d with USGS id)", len(records), len(by_usgs))
    return LayerManifest(
        id=layer,
        version=cfg.version,
        generatedAt=iso(cfg.now),
        sourceUpdatedAt=newest,
        stale=False,
        artifacts=[ArtifactRef(kind="json", url=stored.url, bytes=stored.bytes, name="noaa")],
        attribution=ATTRIBUTION,
        coverage="regional",
        bbox=[-170.0, 17.0, -64.0, 72.0],
        sample=cfg.sample,
        versions=versions_with(cfg),
    )


def utcnow() -> datetime:
    return datetime.now(UTC)
