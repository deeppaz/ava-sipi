"""USGS Water Data OGC API -> gauges/latest.json (+ stations.parquet, stats.json).

Three sub-tasks selected by `cfg.fixtures`/env or the CLI `--task`:
  latest   (15 min)  latest-continuous 00060 + 00065 -> latest.json with percentiles
  stations (weekly)  monitoring-locations site_type_code=ST -> stations.parquet
  stats    (monthly) daily 00060 statistic 00003 -> stats.json monthly percentile tables
"""

from __future__ import annotations

import json
import logging
import os
import statistics
import time
from collections import defaultdict
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from common.config import PipelineConfig, iso
from common.fetch import Fetcher, FetchError
from common.geo import haversine_km
from common.manifest import ArtifactRef, LayerManifest
from common.pipeline import load_fixture_or, tmp_dir, versions_with, write_json
from common.storage import Storage
from common.units import cfs_to_m3s, ft_to_m, percentile_from_quantiles
from common.validate import validate

log = logging.getLogger(__name__)

BASE = "https://api.waterdata.usgs.gov/ogcapi/v0/collections"
PAGE = 10000
PARAM_DISCHARGE = "00060"
PARAM_STAGE = "00065"
STAT_MEAN = "00003"
STATS_YEARS = 10
#: A station's percentile table is rebuilt when older than this (days).
STATS_MAX_AGE_DAYS = int(os.environ.get("USGS_STATS_MAX_AGE_DAYS", "120"))
#: Stations (re)computed per weekly run, largest current discharge first.
STATS_LIMIT = int(os.environ.get("USGS_STATS_LIMIT", "2500"))
#: Wall-clock budget for the stats loop; whatever is done by then is merged and published.
STATS_BUDGET_MIN = float(os.environ.get("USGS_STATS_BUDGET_MIN", "100"))
QUANTILES = (5, 10, 25, 50, 75, 90, 95)

#: Notes this pipeline decides on its own; a rerun replaces them rather than
#: inheriting a stale one from a sibling pipeline writing the same layer.
OWNED_NOTES: frozenset[str] = frozenset({"gauges.noPercentiles", "gauges.noStationNames"})


ATTRIBUTION = {
    "name": "U.S. Geological Survey Water Data for the Nation",
    "url": "https://waterdata.usgs.gov",
    "license": "U.S. public domain",
}


def _headers(cfg: PipelineConfig) -> dict[str, str]:
    return {"X-Api-Key": cfg.usgs_api_key} if cfg.usgs_api_key else {}


def _paginate(
    fetcher: Fetcher,
    url: str,
    params: dict[str, Any],
    headers: dict[str, str],
    max_pages: int = 200,
) -> list[dict[str, Any]]:
    features: list[dict[str, Any]] = []
    next_url: str | None = url
    next_params: dict[str, Any] | None = params
    for _ in range(max_pages):
        if not next_url:
            break
        page = fetcher.get_json(next_url, params=next_params, headers=headers, use_cache=False)
        features.extend(page.get("features", []))
        next_url = None
        next_params = None
        for link in page.get("links", []):
            if link.get("rel") == "next":
                next_url = link["href"]
                break
    return features


# ---------------------------------------------------------------------------- latest


def _fetch_latest(fetcher: Fetcher, cfg: PipelineConfig, param: str) -> list[dict[str, Any]]:
    # Sample mode stops after the first 10 000-station page: the cursor pages of this
    # collection are slow (observed multi-minute 504s) and one page is plenty offline.
    max_pages = int(os.environ.get("USGS_SAMPLE_PAGES", "1")) if cfg.sample else 200
    return _paginate(
        fetcher,
        f"{BASE}/latest-continuous/items",
        {"f": "json", "limit": PAGE, "parameter_code": param},
        _headers(cfg),
        max_pages=max_pages,
    )


def _load_json_if_exists(path: Path) -> Any:
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return None


def _num(v: object) -> float | None:
    """USGS values are strings; sentinels like 'EMPTY', 'Ice', '***' mean no value."""
    try:
        f = float(str(v))
    except (TypeError, ValueError):
        return None
    return None if f != f else f


def _month_index(ts: str) -> int:
    return int(ts[5:7]) - 1


def build_latest(
    discharge: list[dict[str, Any]],
    stage: list[dict[str, Any]],
    stations: dict[str, dict[str, Any]],
    stats: Mapping[str, Sequence[Sequence[float] | None]],
    noaa: Mapping[str, Mapping[str, Any]],
    now: datetime,
    max_age_hours: float = 48.0,
) -> list[dict[str, Any]]:
    cutoff = now - timedelta(hours=max_age_hours)
    gauges: dict[str, dict[str, Any]] = {}

    def base(f: dict[str, Any]) -> dict[str, Any] | None:
        p = f["properties"]
        sid = p["monitoring_location_id"]
        g = gauges.get(sid)
        if g:
            return g
        coords = (f.get("geometry") or {}).get("coordinates")
        if not coords:
            return None
        st = stations.get(sid, {})
        g = {
            "id": sid,
            "name": st.get("name") or sid.replace("USGS-", "USGS "),
            "lat": round(float(coords[1]), 5),
            "lon": round(float(coords[0]), 5),
            "source": "usgs",
        }
        if st.get("riverName"):
            g["riverName"] = st["riverName"]
        gauges[sid] = g
        return g

    for f in discharge:
        p = f["properties"]
        if p.get("value") in (None, "") or p.get("unit_of_measure") != "ft^3/s":
            continue
        ts = datetime.fromisoformat(p["time"])
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=UTC)
        if ts < cutoff:
            continue
        g = base(f)
        if not g:
            continue
        val = _num(p["value"])
        if val is None or val < 0:  # USGS uses negative/non-numeric sentinels for ice/equipment
            continue
        g["discharge"] = {"value": round(cfs_to_m3s(val), 4), "unit": "m3/s", "ts": iso(ts)}
        monthly = stats.get(g["id"])
        if monthly:
            q = monthly[_month_index(g["discharge"]["ts"])]
            if q:
                g["percentile"] = round(
                    percentile_from_quantiles(g["discharge"]["value"], list(q)), 1
                )

    for f in stage:
        p = f["properties"]
        if p.get("value") in (None, "") or p.get("unit_of_measure") != "ft":
            continue
        ts = datetime.fromisoformat(p["time"])
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=UTC)
        if ts < cutoff:
            continue
        g = base(f)
        if not g:
            continue
        stage_val = _num(p["value"])
        if stage_val is None:
            continue
        g["stage"] = {"value": round(ft_to_m(stage_val), 3), "unit": "m", "ts": iso(ts)}

    # NWPS's list endpoint carries no usgsId; join by id when present, else by proximity
    # (nearest NWPS gauge within 800 m — co-located river forecast points).
    grid: dict[tuple[int, int], list[Mapping[str, Any]]] = defaultdict(list)
    for n in noaa.values():
        if n.get("lat") is None or n.get("lon") is None:
            continue
        grid[(int(float(n["lat"]) * 50), int(float(n["lon"]) * 50))].append(n)

    def nearest_nwps(lat: float, lon: float) -> Mapping[str, Any] | None:
        best: Mapping[str, Any] | None = None
        best_d = 0.8
        cy, cx = int(lat * 50), int(lon * 50)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for n in grid.get((cy + dy, cx + dx), []):
                    d = haversine_km((lon, lat), (float(n["lon"]), float(n["lat"])))
                    if d < best_d:
                        best_d, best = d, n
        return best

    for sid, g in gauges.items():
        n = noaa.get(sid.replace("USGS-", "")) or nearest_nwps(g["lat"], g["lon"])
        if n:
            g["floodCategory"] = n.get("floodCategory", "none")
            if n.get("lid"):
                g["nwsLid"] = n["lid"]
            if not g.get("name") or g["name"].startswith("USGS "):
                g["name"] = n.get("name") or g["name"]

    out = [g for g in gauges.values() if "discharge" in g or "stage" in g]
    out.sort(key=lambda g: g["id"])
    return out


# ---------------------------------------------------------------------------- stations


def _fetch_stations(
    fetcher: Fetcher, cfg: PipelineConfig, ids: set[str] | None
) -> dict[str, dict[str, Any]]:
    feats = _paginate(
        fetcher,
        f"{BASE}/monitoring-locations/items",
        {"f": "json", "limit": PAGE, "site_type_code": "ST"},
        _headers(cfg),
        max_pages=60,
    )
    out: dict[str, dict[str, Any]] = {}
    for f in feats:
        p = f["properties"]
        sid = f.get("id") or p.get("id")
        if not sid:
            continue
        if ids is not None and sid not in ids:
            continue
        coords = (f.get("geometry") or {}).get("coordinates") or [None, None]
        rec = {
            "id": sid,
            "name": p.get("monitoring_location_name"),
            "lat": coords[1],
            "lon": coords[0],
            "state": p.get("state_name"),
            "huc": p.get("hydrologic_unit_code"),
        }
        da = p.get("drainage_area")
        if da not in (None, ""):
            rec["drainageKm2"] = round(float(da) * 2.589988110336, 1)
        out[sid] = rec
    return out


def _river_name(station_name: str | None) -> str | None:
    """'POTOMAC RIVER NEAR WASH, DC LITTLE FALLS PUMP STA' -> 'Potomac River'."""
    if not station_name:
        return None
    upper = station_name.upper()
    for sep in (" AT ", " NEAR ", " NR ", " BELOW ", " BL ", " ABOVE ", " AB ", " @ ", ","):
        if sep in upper:
            upper = upper.split(sep, 1)[0]
    words = upper.strip().split()
    if not words or len(words) > 6:
        return None
    return " ".join(w.capitalize() if len(w) > 2 else w for w in words)


def write_stations_parquet(stations: dict[str, dict[str, Any]], path: Path) -> Path:
    import pyarrow as pa
    import pyarrow.parquet as pq

    rows = list(stations.values())
    table = pa.table(
        {
            "id": [r["id"] for r in rows],
            "name": [r.get("name") for r in rows],
            "lat": pa.array([r.get("lat") for r in rows], pa.float32()),
            "lon": pa.array([r.get("lon") for r in rows], pa.float32()),
            "state": [r.get("state") for r in rows],
            "huc": [r.get("huc") for r in rows],
            "drainageKm2": pa.array([r.get("drainageKm2") for r in rows], pa.float32()),
        }
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(table, path, compression="snappy")
    return path


def read_stations_parquet(path: Path) -> dict[str, dict[str, Any]]:
    import pyarrow.parquet as pq

    table = pq.read_table(path)
    out: dict[str, dict[str, Any]] = {}
    for r in table.to_pylist():
        r["riverName"] = _river_name(r.get("name"))
        out[r["id"]] = r
    return out


# ---------------------------------------------------------------------------- stats


def monthly_quantiles(values_by_month: dict[int, list[float]]) -> list[list[float] | None]:
    out: list[list[float] | None] = []
    for m in range(12):
        vals = sorted(v for v in values_by_month.get(m, []) if v >= 0)
        if len(vals) < 60:  # need at least ~2 months of daily data in that calendar month
            out.append(None)
            continue
        qs = statistics.quantiles(vals, n=100, method="inclusive")  # 99 cut points
        out.append([round(qs[q - 1], 4) for q in QUANTILES])
    return out


def _fetch_daily(
    fetcher: Fetcher, cfg: PipelineConfig, sid: str, since: datetime
) -> list[dict[str, Any]]:
    return _paginate(
        fetcher,
        f"{BASE}/daily/items",
        {
            "f": "json",
            "limit": PAGE,
            "monitoring_location_id": sid,
            "parameter_code": PARAM_DISCHARGE,
            "statistic_id": STAT_MEAN,
            "datetime": f"{since.strftime('%Y-%m-%d')}/..",
        },
        _headers(cfg),
        max_pages=2,
    )


def build_stats(
    fetcher: Fetcher,
    cfg: PipelineConfig,
    station_ids: list[str],
    budget_min: float = STATS_BUDGET_MIN,
) -> dict[str, Any]:
    since = cfg.now - timedelta(days=365 * STATS_YEARS)
    deadline = time.monotonic() + budget_min * 60
    stations = []
    day = cfg.now.strftime("%Y-%m-%d")
    for i, sid in enumerate(station_ids):
        if time.monotonic() > deadline:
            log.warning("stats budget of %.0f min reached after %d stations", budget_min, i)
            break
        try:
            feats = _fetch_daily(fetcher, cfg, sid, since)
        except FetchError as exc:
            log.warning("daily fetch failed for %s: %s", sid, exc)
            continue
        by_month: dict[int, list[float]] = defaultdict(list)
        years: set[str] = set()
        for f in feats:
            p = f["properties"]
            if p.get("value") in (None, "") or p.get("unit_of_measure") != "ft^3/s":
                continue
            val = _num(p["value"])
            if val is None or val < 0:
                continue
            t = str(p["time"])
            by_month[int(t[5:7]) - 1].append(cfs_to_m3s(val))
            years.add(t[:4])
        stations.append(
            {
                "id": sid,
                "monthly": monthly_quantiles(by_month),
                "years": len(years),
                "computedAt": day,
            }
        )
        if (i + 1) % 100 == 0:
            log.info("stats %d/%d", i + 1, len(station_ids))
    return {"generatedAt": iso(cfg.now), "stations": stations}


def stale_ids(previous: dict[str, Any] | None, now: datetime) -> set[str]:
    """Stations whose table is fresh enough to keep; everything else is due."""
    if not previous:
        return set()
    keep = set()
    cutoff = (now - timedelta(days=STATS_MAX_AGE_DAYS)).strftime("%Y-%m-%d")
    for s in previous.get("stations", []):
        if str(s.get("computedAt", "")) >= cutoff:
            keep.add(s["id"])
    return keep


def merge_stats(
    previous: dict[str, Any] | None, fresh: dict[str, Any], now: datetime
) -> dict[str, Any]:
    """Fresh tables replace old ones; old tables survive unless they are past the age limit.

    Tables without a `computedAt` (written before this field existed) are kept for one more cycle
    so a partial run never shrinks the published set.
    """
    cutoff = (now - timedelta(days=STATS_MAX_AGE_DAYS)).strftime("%Y-%m-%d")
    merged: dict[str, dict[str, Any]] = {}
    for s in (previous or {}).get("stations", []):
        stamp = s.get("computedAt")
        if stamp is None or str(stamp) >= cutoff:
            merged[s["id"]] = s
    for s in fresh.get("stations", []):
        merged[s["id"]] = s
    return {"generatedAt": fresh["generatedAt"], "stations": [merged[k] for k in sorted(merged)]}


# ---------------------------------------------------------------------------- run


def run(cfg: PipelineConfig) -> LayerManifest:
    layer = "gauges"
    task = os.environ.get("USGS_TASK", "latest")
    storage = Storage(cfg.out_dir, cfg.public_base_url, cfg.publish)
    latest_dir = cfg.out_dir / layer / "latest"
    tmp = tmp_dir(cfg, "gauges_usgs")
    artifacts: list[ArtifactRef] = []
    notes: list[str] = []

    with Fetcher(
        cache_dir=cfg.out_dir / ".cache", per_second=5 if cfg.usgs_api_key else 2, timeout=120
    ) as fetcher:
        # ---- stations (weekly) or reuse previous
        stations: dict[str, dict[str, Any]] = {}
        stations_path = latest_dir / "stations.parquet"
        if "usgs_stations" in cfg.fixtures:
            raw = load_fixture_or(cfg, "usgs_stations", lambda: {})
            for f in raw.get("features", []):
                p = f["properties"]
                sid = f.get("id") or p.get("id")
                coords = (f.get("geometry") or {}).get("coordinates") or [None, None]
                stations[sid] = {
                    "id": sid,
                    "name": p.get("monitoring_location_name"),
                    "lat": coords[1],
                    "lon": coords[0],
                    "riverName": _river_name(p.get("monitoring_location_name")),
                }
        elif task == "stations":
            stations = _fetch_stations(fetcher, cfg, None)
            for s in stations.values():
                s["riverName"] = _river_name(s.get("name"))
            p = write_stations_parquet(stations, tmp / "stations.parquet")
            st = storage.put(p, layer, cfg.version, "stations.parquet", cache_seconds=86400)
            artifacts.append(
                ArtifactRef(kind="parquet", url=st.url, bytes=st.bytes, name="stations")
            )
        elif stations_path.exists():
            stations = read_stations_parquet(stations_path)

        # ---- stats (monthly) or reuse previous
        stats: dict[str, list[list[float] | None]] = {}
        stats_doc = None
        if "usgs_stats" in cfg.fixtures:
            stats_doc = load_fixture_or(cfg, "usgs_stats", lambda: {})
        elif task == "stats":
            discharge_now = _fetch_latest(fetcher, cfg, PARAM_DISCHARGE)
            # biggest rivers first: they carry the map, and a cut-off run should still cover them
            by_val = sorted(
                discharge_now, key=lambda f: -(_num(f["properties"].get("value")) or 0.0)
            )
            ordered: list[str] = []
            seen: set[str] = set()
            for f in by_val:
                sid = f["properties"]["monitoring_location_id"]
                if sid not in seen:
                    seen.add(sid)
                    ordered.append(sid)
            previous = None if cfg.sample else _load_json_if_exists(latest_dir / "stats.json")
            fresh_enough = stale_ids(previous, cfg.now)
            limit = int(os.environ.get("USGS_SAMPLE_STATS", "300")) if cfg.sample else STATS_LIMIT
            ids = [sid for sid in ordered if sid not in fresh_enough][:limit]
            log.info(
                "stats: %d stations due (%d fresh, %d total), computing %d this run",
                len(ordered) - len(fresh_enough),
                len(fresh_enough),
                len(ordered),
                len(ids),
            )
            stats_doc = merge_stats(previous, build_stats(fetcher, cfg, ids), cfg.now)
            validate("gauge-stats", stats_doc)
            p = write_json(tmp / "stats.json", stats_doc)
            st = storage.put(p, layer, cfg.version, "stats.json", cache_seconds=86400)
            artifacts.append(ArtifactRef(kind="json", url=st.url, bytes=st.bytes, name="stats"))
        else:
            stats_doc = _load_json_if_exists(latest_dir / "stats.json")
        if stats_doc:
            stats = {s["id"]: s["monthly"] for s in stats_doc.get("stations", [])}

        # ---- latest (every run)
        discharge = load_fixture_or(
            cfg, "usgs_latest_discharge", lambda: _fetch_latest(fetcher, cfg, PARAM_DISCHARGE)
        )
        stage = load_fixture_or(
            cfg, "usgs_latest_stage", lambda: _fetch_latest(fetcher, cfg, PARAM_STAGE)
        )
        if isinstance(discharge, dict):
            discharge = discharge.get("features", [])
        if isinstance(stage, dict):
            stage = stage.get("features", [])

    noaa_doc = _load_json_if_exists(latest_dir / "noaa.json")
    if "nwps_normalized" in cfg.fixtures:
        noaa_doc = load_fixture_or(cfg, "nwps_normalized", lambda: {})
    noaa = {
        (g.get("usgsId") or f"lid:{g['lid']}"): g
        for g in (noaa_doc or {}).get("gauges", [])
        if g.get("lid")
    }

    gauges = build_latest(discharge, stage, stations, stats, noaa, cfg.now)
    doc = {"generatedAt": iso(cfg.now), "count": len(gauges), "gauges": gauges}
    validate("gauges-latest", doc)
    p = write_json(tmp / "latest.json", doc)
    st = storage.put(p, layer, cfg.version, "latest.json", cache_seconds=300)
    artifacts.insert(0, ArtifactRef(kind="json", url=st.url, bytes=st.bytes, name="latest"))
    if noaa_doc:
        n_path = latest_dir / "noaa.json"
        if n_path.exists():
            artifacts.append(
                ArtifactRef(
                    kind="json",
                    url=storage.url_for(f"{layer}/latest/noaa.json"),
                    bytes=n_path.stat().st_size,
                    name="noaa",
                )
            )
    if not stats:
        notes.append("gauges.noPercentiles")
    named = sum(1 for g in gauges if not g["name"].startswith("USGS "))
    if gauges and named < len(gauges) / 2:
        notes.append("gauges.noStationNames")

    newest = max(
        (g.get("discharge", g.get("stage", {})).get("ts", "") for g in gauges), default=""
    ) or iso(cfg.now)
    lons = [g["lon"] for g in gauges]
    lats = [g["lat"] for g in gauges]
    return LayerManifest(
        id=layer,
        version=cfg.version,
        generatedAt=iso(cfg.now),
        sourceUpdatedAt=newest,
        stale=False,
        artifacts=artifacts,
        attribution=ATTRIBUTION,
        coverage="regional",
        bbox=[min(lons), min(lats), max(lons), max(lats)] if gauges else None,
        legend={
            "unit": "percentile",
            "stops": [
                {"value": 0, "color": "#C8873A", "label": "< 10"},
                {"value": 10, "color": "#D9A45B", "label": "10–25"},
                {"value": 25, "color": "#7FB8D6", "label": "25–75"},
                {"value": 75, "color": "#35E0E0", "label": "75–90"},
                {"value": 90, "color": "#EAF4F8", "label": "> 90"},
            ],
        },
        sample=cfg.sample,
        versions=versions_with(cfg),
        notes=notes,
    )
