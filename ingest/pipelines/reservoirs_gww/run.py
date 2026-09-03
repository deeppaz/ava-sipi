"""Global Water Watch reservoirs -> reservoirs/latest.json + reservoirs/series/<id>.json.

Surface-area fill proxy: fill_pct = area_now / p95(area over last 3 years) * 100.
"""

from __future__ import annotations

import logging
import os
import statistics
from datetime import UTC, datetime, timedelta
from typing import Any

from common.config import PipelineConfig, iso
from common.fetch import Fetcher, FetchError
from common.geo import polygon_centroid
from common.manifest import ArtifactRef, LayerManifest
from common.pipeline import load_fixture_or, tmp_dir, versions_with, write_json
from common.storage import Storage
from common.validate import validate

log = logging.getLogger(__name__)

BASE = "https://api.globalwaterwatch.earth"
VARIABLE = "surface_water_area_monthly"
YEARS = 3
LIST_PAGE = 1000

#: Notes this pipeline decides on its own; a rerun replaces them rather than
#: inheriting a stale one from a sibling pipeline writing the same layer.
OWNED_NOTES: frozenset[str] = frozenset({"reservoirs.proxy"})


ATTRIBUTION = {
    "name": "Global Water Watch (Deltares, World Resources Institute, WWF) · GRanD",
    "url": "https://www.globalwaterwatch.earth",
    "license": "CC BY 4.0",
}

# Sample mode: well-known reservoirs located by a small box around a point inside the water body.
SAMPLE_SEEDS: list[tuple[str, float, float, str]] = [
    ("Lake Mead", -114.42, 36.15, "United States"),
    ("Lake Powell", -111.30, 37.05, "United States"),
    ("Shasta Lake", -122.30, 40.75, "United States"),
    ("Lake Oroville", -121.45, 39.58, "United States"),
    ("Atatürk Barajı", 38.55, 37.60, "Türkiye"),
    ("Keban Barajı", 38.90, 38.85, "Türkiye"),
    ("Tabqa (Lake Assad)", 38.30, 35.95, "Syria"),
    ("Mosul Dam", 42.75, 36.70, "Iraq"),
    ("Lake Nasser", 32.85, 23.00, "Egypt"),
    ("Three Gorges", 110.65, 30.95, "China"),
    ("Lake Kariba", 28.10, -17.00, "Zambia / Zimbabwe"),
    ("Cahora Bassa", 32.20, -15.70, "Mozambique"),
    ("Lake Volta", -0.10, 7.30, "Ghana"),
    ("Guri (Simón Bolívar)", -62.85, 7.55, "Venezuela"),
    ("Itaipu", -54.45, -25.10, "Brazil / Paraguay"),
    ("Sobradinho", -41.20, -9.55, "Brazil"),
    ("Toktogul", 72.95, 41.75, "Kyrgyzstan"),
    ("Tarbela", 72.70, 34.20, "Pakistan"),
    ("Sardar Sarovar", 73.75, 21.85, "India"),
    ("Alqueva", -7.50, 38.25, "Portugal"),
    ("Lake Nasser (Toshka)", 32.60, 22.80, "Egypt"),
    ("Bratsk", 101.75, 56.00, "Russia"),
    ("Lake Argyle", 128.75, -16.30, "Australia"),
    ("Hume", 147.15, -36.10, "Australia"),
    ("Lake Sakakawea", -102.00, 47.60, "United States"),
]


def _bbox_polygon(lon: float, lat: float, d: float = 0.03) -> dict[str, Any]:
    return {
        "type": "Polygon",
        "coordinates": [
            [
                [lon - d, lat - d],
                [lon + d, lat - d],
                [lon + d, lat + d],
                [lon - d, lat + d],
                [lon - d, lat - d],
            ]
        ],
    }


def _feature_centroid(geom: dict[str, Any]) -> tuple[float, float]:
    if geom["type"] == "Polygon":
        return polygon_centroid(geom["coordinates"][0])
    # MultiPolygon: centroid of the largest ring
    rings = [p[0] for p in geom["coordinates"]]
    biggest = max(rings, key=len)
    return polygon_centroid(biggest)


def derive(series: list[dict[str, Any]], now: datetime) -> dict[str, Any]:
    """From monthly [{t, value(m2)}] compute areaKm2, fillPct, trend90d and the compact series."""
    pts = sorted(
        (str(s["t"])[:10], float(s["value"]) / 1e6) for s in series if s.get("value") is not None
    )
    if not pts:
        return {"points": []}
    since = (now - timedelta(days=365 * YEARS)).strftime("%Y-%m-%d")
    window = [a for d, a in pts if d >= since] or [a for _, a in pts]
    window_sorted = sorted(window)
    p95 = window_sorted[min(len(window_sorted) - 1, int(round(0.95 * (len(window_sorted) - 1))))]
    latest_day, latest_area = pts[-1]
    fill = min(100.0, latest_area / p95 * 100.0) if p95 > 0 else None
    # trend: compare with the value ~90 days earlier
    day90 = (datetime.fromisoformat(latest_day) - timedelta(days=90)).strftime("%Y-%m-%d")
    older = [a for d, a in pts if d <= day90]
    trend = None
    if older and p95 > 0 and fill is not None:
        trend = fill - min(100.0, older[-1] / p95 * 100.0)
    out: dict[str, Any] = {
        "points": [[d, round(a, 4)] for d, a in pts],
        "areaP95Km2": round(p95, 4),
        "areaKm2": round(latest_area, 4),
        "observedAt": iso(datetime.fromisoformat(latest_day).replace(tzinfo=UTC)),
    }
    if fill is not None:
        out["fillPct"] = round(fill, 1)
    if trend is not None:
        out["trend90d"] = round(trend, 1)
    return out


def _median_series_start(now: datetime) -> str:
    return (now - timedelta(days=365 * YEARS + 30)).strftime("%Y-%m-%dT00:00:00")


def run(cfg: PipelineConfig) -> LayerManifest:
    layer = "reservoirs"
    storage = Storage(cfg.out_dir, cfg.public_base_url, cfg.publish)
    tmp = tmp_dir(cfg, layer)
    reservoirs: list[dict[str, Any]] = []
    artifacts: list[ArtifactRef] = []

    with Fetcher(cache_dir=cfg.out_dir / ".cache", per_second=3, timeout=90) as fetcher:
        # ---- 1. reservoir list ------------------------------------------------------
        if "gww_reservoirs" in cfg.fixtures:
            features = load_fixture_or(cfg, "gww_reservoirs", lambda: {"features": []})["features"]
            countries: dict[str, str] = {}
        elif cfg.sample:
            features = []
            countries = {}
            for name, lon, lat, country in SAMPLE_SEEDS:
                try:
                    fc = fetcher.post_json(f"{BASE}/reservoir/geometry", _bbox_polygon(lon, lat))
                except FetchError as exc:
                    log.warning("gww geometry lookup failed for %s: %s", name, exc)
                    continue
                feats = fc.get("features") or []
                if not feats:
                    continue
                # biggest polygon in the box
                f = max(feats, key=lambda x: len(str(x.get("geometry"))))
                f.setdefault("properties", {})
                if not f["properties"].get("name_en") and not f["properties"].get("name"):
                    f["properties"]["name_en"] = name
                countries[str(f["id"])] = country
                features.append(f)
        else:
            features = []
            countries = {}
            skip = 0
            while True:
                page = fetcher.get_json(
                    f"{BASE}/reservoir", params={"skip": skip, "limit": LIST_PAGE}, use_cache=False
                )
                feats = page.get("features") or []
                # v1 scope: reservoirs that exist in GRanD (large dams with capacity metadata)
                features.extend(f for f in feats if (f.get("properties") or {}).get("grand_id"))
                if len(feats) < LIST_PAGE:
                    break
                skip += LIST_PAGE
                if skip > 200000:
                    break

        # ---- 2. time series per reservoir ------------------------------------------
        series_fixture = (
            load_fixture_or(cfg, "gww_series", lambda: None)
            if "gww_series" in cfg.fixtures
            else None
        )
        start = _median_series_start(cfg.now)
        stop = cfg.now.strftime("%Y-%m-%dT00:00:00")
        for f in features:
            rid = str(f.get("id"))
            props = f.get("properties") or {}
            geom = f.get("geometry")
            if not geom:
                continue
            lon, lat = _feature_centroid(geom)
            if series_fixture is not None:
                raw_series = series_fixture.get(rid, [])
            else:
                try:
                    raw_series = fetcher.get_json(
                        f"{BASE}/reservoir/{rid}/ts/{VARIABLE}",
                        params={"start": start, "stop": stop},
                        use_cache=False,
                    )
                except FetchError as exc:
                    log.warning("series failed for %s: %s", rid, exc)
                    raw_series = []
            d = derive(raw_series, cfg.now)
            series_doc = {"id": rid, "unit": "km2", "points": d["points"]}
            if "areaP95Km2" in d:
                series_doc["areaP95Km2"] = d["areaP95Km2"]
            validate("reservoir-series", series_doc)
            sp = write_json(tmp / "series" / f"{rid}.json", series_doc)
            st = storage.put(sp, layer, cfg.version, f"series/{rid}.json", cache_seconds=86400)
            rec: dict[str, Any] = {
                "id": rid,
                "name": props.get("name_en") or props.get("name") or f"Reservoir {rid}",
                "country": countries.get(rid) or props.get("country") or "",
                "lat": round(lat, 4),
                "lon": round(lon, 4),
                "seriesUrl": st.url,
            }
            for k in ("fillPct", "trend90d", "areaKm2", "observedAt"):
                if k in d:
                    rec[k] = d[k]
            if props.get("grand_id"):
                rec["grandId"] = int(props["grand_id"])
            reservoirs.append(rec)

    doc = {"generatedAt": iso(cfg.now), "reservoirs": reservoirs}
    validate("reservoirs-latest", doc)
    p = write_json(tmp / "latest.json", doc)
    st = storage.put(p, layer, cfg.version, "latest.json", cache_seconds=3600)
    artifacts.insert(0, ArtifactRef(kind="json", url=st.url, bytes=st.bytes, name="latest"))
    newest = max((r.get("observedAt", "") for r in reservoirs), default="") or iso(cfg.now)
    return LayerManifest(
        id=layer,
        version=cfg.version,
        generatedAt=iso(cfg.now),
        sourceUpdatedAt=newest,
        stale=False,
        artifacts=artifacts,
        attribution=ATTRIBUTION,
        coverage="global",
        legend={
            "unit": "%",
            "stops": [
                {"value": 0, "color": "#7A4A1C", "label": "0"},
                {"value": 40, "color": "#C8873A", "label": "40"},
                {"value": 70, "color": "#7FB8D6", "label": "70"},
                {"value": 100, "color": "#EAF4F8", "label": "100"},
            ],
        },
        sample=cfg.sample,
        versions=versions_with(cfg),
        notes=["reservoirs.proxy"],
    )


def _unused(_: Any) -> None:  # keep statistics import for future p95 refinement
    statistics.median([0.0])
    os.getcwd()
