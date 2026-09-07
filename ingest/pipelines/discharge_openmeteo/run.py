"""Open-Meteo Flood API (GloFAS) -> discharge/YYYYMMDD.parquet: ratio = today / mean discharge.

Points come from the rivers pipeline (`rivers/latest/points.json`): midpoints of HydroRIVERS
segments with ORD_STRA >= 6 (spine segments in sample mode).
"""

from __future__ import annotations

import json
import logging
import math
import os
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from common.config import PipelineConfig, iso
from common.fetch import Fetcher, FetchError
from common.manifest import ArtifactRef, LayerManifest
from common.pipeline import load_fixture_or, tmp_dir, versions_with, write_json
from common.storage import Storage
from common.validate import validate

log = logging.getLogger(__name__)

FLOOD_URL = "https://flood-api.open-meteo.com/v1/flood"
BATCH = 100
# Open-Meteo weights a request by locations x variables x weeks of data, and the free plan allows
# ~600 units/minute and 10,000/day. Two past days is all the ratio needs (GloFAS lags a day); the
# panel fetches the 30-day series per river on demand.
PAST_DAYS = 2
FORECAST_DAYS = 7
#: Batches per minute; each batch of 100 locations over ~9 days costs roughly 100 units.
BATCHES_PER_MINUTE = int(os.environ.get("OPENMETEO_BATCHES_PER_MINUTE", "5"))
#: Hard cap on points per run; the unit budget below is what normally limits a run.
DAILY_POINT_LIMIT = int(os.environ.get("OPENMETEO_POINT_LIMIT", "5000"))
#: Locations queried per run: one location over ~9 days ≈ one unit. The free plan allows 10 000 a
#: day but also 5 000 an hour, and a run finishes well inside an hour, so the hourly cap is the
#: binding one (batches 68–70 of a 9 000-unit run came back 429). With OPEN_METEO_API_KEY set the
#: limits are far higher and the budget can be raised through this variable.
UNIT_BUDGET = int(os.environ.get("OPENMETEO_UNIT_BUDGET", "4500"))
RATIO_CAP = 12.0

# GloFAS v4 is a 0.05° grid and Open-Meteo answers for the nearest cell. A river centreline's
# midpoint often falls one cell off the routed channel: the Mississippi read 0.3 m³/s and the
# Yangtze 12. An uncalibrated point is therefore probed at its own cell and the four neighbours,
# the cell with the largest discharge is taken as the channel, and that offset is remembered in
# cells.json so later runs pay one location per point instead of five.
CELL_DEG = 0.05
OFFSETS: tuple[tuple[float, float], ...] = (
    (0.0, 0.0),
    (CELL_DEG, 0.0),
    (-CELL_DEG, 0.0),
    (0.0, CELL_DEG),
    (0.0, -CELL_DEG),
)

#: Notes this pipeline decides on its own; a rerun replaces them rather than
#: inheriting a stale one from a sibling pipeline writing the same layer.
OWNED_NOTES: frozenset[str] = frozenset({"rivers.ratioSource"})


ATTRIBUTION = {
    "name": "Open-Meteo Flood API (Copernicus GloFAS v4) · HydroRIVERS mean discharge",
    "url": "https://open-meteo.com/en/docs/flood-api",
    "license": "CC BY 4.0 (Open-Meteo) · GloFAS: Copernicus licence",
}


def _chunks(items: list[Any], n: int) -> list[list[Any]]:
    return [items[i : i + n] for i in range(0, len(items), n)]


def fetch_batch(
    fetcher: Fetcher, points: list[dict[str, Any]], api_key: str | None = None
) -> list[dict[str, Any]]:
    """`points` are dicts with lat/lon (a river point or a probed neighbour cell)."""
    params: dict[str, Any] = {
        "latitude": ",".join(f"{p['lat']:.4f}" for p in points),
        "longitude": ",".join(f"{p['lon']:.4f}" for p in points),
        "daily": "river_discharge",
        "past_days": PAST_DAYS,
        "forecast_days": FORECAST_DAYS,
        "timeformat": "iso8601",
    }
    if api_key:
        params["apikey"] = api_key
    data = fetcher.get_json(FLOOD_URL, params=params, use_cache=False)
    return data if isinstance(data, list) else [data]


def today_and_forecast(resp: dict[str, Any] | None, today: str) -> tuple[float, list[float]] | None:
    """(today's discharge, forecast days) from one Open-Meteo response, or None when unusable."""
    daily = (resp or {}).get("daily") or {}
    times: list[str] = daily.get("time") or []
    vals: list[float | None] = daily.get("river_discharge") or []
    if not times or not vals:
        return None
    series = {
        t: v for t, v in zip(times, vals, strict=False) if v is not None and not math.isnan(v)
    }
    # "today" = the last past day with a value (GloFAS lags ~1 day)
    past = [t for t in times if t <= today and t in series]
    if not past:
        return None
    t0 = past[-1]
    today_val = float(series[t0])
    if today_val <= 0:
        # GloFAS reports 0 where its grid cell is not on the routed network; that is "no data",
        # not a dry river, so the map keeps its neutral colour there.
        return None
    forecast = [round(float(series[t]), 3) for t in times if t > t0 and t in series][:FORECAST_DAYS]
    return today_val, forecast


def record_for(pt: dict[str, Any], today_val: float, forecast: list[float]) -> dict[str, Any]:
    mean = float(pt.get("meanDischarge") or 0)
    ratio = min(RATIO_CAP, today_val / mean) if mean > 0 else 1.0
    return {
        "id": int(pt["id"]),
        "ratio": round(ratio, 4),
        "today": round(today_val, 3),
        "forecast": forecast,
        "lat": round(float(pt["lat"]), 4),
        "lon": round(float(pt["lon"]), 4),
    }


def build_records(
    points: list[dict[str, Any]], responses: list[dict[str, Any]], today: str
) -> list[dict[str, Any]]:
    """One response per point (already-calibrated case, fixtures, sample mode)."""
    records: list[dict[str, Any]] = []
    for pt, resp in zip(points, responses, strict=False):
        got = today_and_forecast(resp, today)
        if got:
            records.append(record_for(pt, *got))
    return records


Cells = dict[str, dict[str, Any]]


def plan_queries(
    points: list[dict[str, Any]], cells: Cells, budget: int = UNIT_BUDGET
) -> list[tuple[int, tuple[float, float]]]:
    """(point index, offset) pairs to query, in point order, within the unit budget.

    A calibrated point costs one location at its remembered offset; an uncalibrated one is probed
    at all OFFSETS. Points are already ordered largest-first, so the budget runs out on the small
    rivers, never on the spine.
    """
    plan: list[tuple[int, tuple[float, float]]] = []
    used = 0
    for i, pt in enumerate(points):
        known = cells.get(str(pt["id"]))
        cost = 1 if known else len(OFFSETS)
        if used + cost > budget:
            break
        used += cost
        if known:
            plan.append((i, (float(known["dlon"]), float(known["dlat"]))))
        else:
            plan.extend((i, off) for off in OFFSETS)
    return plan


def choose_cells(
    points: list[dict[str, Any]],
    plan: list[tuple[int, tuple[float, float]]],
    responses: list[dict[str, Any]],
    today: str,
    cells: Cells,
) -> list[dict[str, Any]]:
    """Pick the channel cell per point, update `cells` in place, return the records."""
    by_point: dict[int, list[tuple[tuple[float, float], tuple[float, list[float]]]]] = {}
    probed: set[int] = set()
    for (i, off), resp in zip(plan, responses, strict=False):
        probed.add(i)
        got = today_and_forecast(resp, today)
        if got:
            by_point.setdefault(i, []).append((off, got))
    records: list[dict[str, Any]] = []
    for i in sorted(probed):
        pt = points[i]
        key = str(pt["id"])
        found = by_point.get(i)
        if not found:
            # a remembered cell that stopped answering is forgotten so the next run re-probes
            cells.pop(key, None)
            continue
        off, (today_val, forecast) = max(found, key=lambda x: x[1][0])
        prev = cells.get(key)
        if prev and (float(prev["dlon"]), float(prev["dlat"])) == off:
            prev["hits"] = int(prev.get("hits", 0)) + 1
        else:
            cells[key] = {"dlon": off[0], "dlat": off[1], "hits": 1}
        records.append(record_for(pt, today_val, forecast))
    return records


def write_parquet(records: list[dict[str, Any]], path: Path) -> Path:
    import pyarrow as pa
    import pyarrow.parquet as pq

    table = pa.table(
        {
            "id": pa.array([r["id"] for r in records], pa.int64()),
            "ratio": pa.array([r["ratio"] for r in records], pa.float32()),
            "today": pa.array([r["today"] for r in records], pa.float32()),
            "forecast": pa.array([r["forecast"] for r in records], pa.list_(pa.float32())),
            "lat": pa.array([r["lat"] for r in records], pa.float32()),
            "lon": pa.array([r["lon"] for r in records], pa.float32()),
        }
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(table, path, compression="snappy")
    return path


def run(cfg: PipelineConfig) -> LayerManifest:
    layer = "rivers"
    points_path = cfg.out_dir / layer / "latest" / "points.json"
    if "river_points" in cfg.fixtures:
        points = load_fixture_or(cfg, "river_points", lambda: [])
    elif points_path.exists():
        points = json.loads(points_path.read_text(encoding="utf-8"))
    else:
        raise FileNotFoundError("rivers/latest/points.json missing — run the rivers pipeline first")
    if cfg.sample:
        points = points[: int(os.environ.get("OPENMETEO_SAMPLE_POINTS", "600"))]
    elif len(points) > DAILY_POINT_LIMIT:
        # points.json is sorted by mean discharge, so this keeps the largest rivers
        log.info(
            "querying the %d largest of %d points (API budget)", DAILY_POINT_LIMIT, len(points)
        )
        points = points[:DAILY_POINT_LIMIT]

    today = cfg.now.astimezone(UTC).strftime("%Y-%m-%d")
    cells_path = cfg.out_dir / layer / "latest" / "cells.json"
    cells: Cells = {}
    if cells_path.exists() and not cfg.sample:
        cells = json.loads(cells_path.read_text(encoding="utf-8")).get("cells", {})
    responses: list[dict[str, Any]] = []
    plan: list[tuple[int, tuple[float, float]]] | None = None
    if "openmeteo_responses" in cfg.fixtures:
        responses = load_fixture_or(cfg, "openmeteo_responses", lambda: [])
    else:
        api_key = os.environ.get("OPEN_METEO_API_KEY") or None
        pace = 60.0 / max(BATCHES_PER_MINUTE, 1) if not api_key else 0.0
        plan = plan_queries(points, cells, budget=UNIT_BUDGET if not cfg.sample else 10**9)
        queries = [
            {"lat": points[i]["lat"] + dlat, "lon": points[i]["lon"] + dlon}
            for i, (dlon, dlat) in plan
        ]
        n_points = len({i for i, _ in plan})
        log.info(
            "%d locations for %d points (%d already calibrated)",
            len(queries),
            n_points,
            sum(1 for i in {i for i, _ in plan} if str(points[i]["id"]) in cells),
        )
        batches = _chunks(queries, BATCH)
        # A healthy answer arrives in ~2 s; the API sometimes leaves a socket hanging instead, and
        # every hang used to cost the full 90 s timeout (the daily job missed its hour by minutes).
        with Fetcher(
            cache_dir=cfg.out_dir / ".cache", per_second=4, timeout=30, retries=3
        ) as fetcher:
            for i, batch in enumerate(batches):
                started = time.monotonic()
                try:
                    responses.extend(fetch_batch(fetcher, batch, api_key))
                except FetchError as exc:
                    log.warning("open-meteo batch %d/%d failed: %s", i + 1, len(batches), exc)
                    responses.extend([{} for _ in batch])
                # pace by wall clock: a slow batch has already paid its share of the minute
                remaining = pace - (time.monotonic() - started)
                if remaining > 0 and i + 1 < len(batches):
                    time.sleep(remaining)
    if plan is None:
        records = build_records(points, responses, today)
    else:
        records = choose_cells(points, plan, responses, today, cells)
    doc = {"day": today, "source": "open-meteo-flood", "records": records}
    validate("discharge-file", doc)

    tmp = tmp_dir(cfg, "discharge")
    storage = Storage(cfg.out_dir, cfg.public_base_url, cfg.publish)
    stamp = today.replace("-", "")
    artifacts: list[ArtifactRef] = []
    if plan is not None and not cfg.sample:
        # the calibration lives with the rivers layer so restore.py brings it back next run
        cp = write_json(tmp / "cells.json", {"day": today, "cells": cells})
        stc = storage.put(cp, layer, cfg.version, "cells.json", cache_seconds=3600)
        artifacts.append(ArtifactRef(kind="json", url=stc.url, bytes=stc.bytes, name="cells"))
    pq_path = write_parquet(records, tmp / f"{stamp}.parquet")
    st = storage.put(pq_path, "discharge", cfg.version, f"{stamp}.parquet", cache_seconds=3600)
    artifacts.append(ArtifactRef(kind="parquet", url=st.url, bytes=st.bytes, name="discharge"))
    # A JSON twin keeps offline mode dependency-free and is tiny in sample mode.
    if cfg.sample or len(records) <= 5000:
        js = write_json(tmp / f"{stamp}.json", doc)
        st2 = storage.put(js, "discharge", cfg.version, f"{stamp}.json", cache_seconds=3600)
        artifacts.append(
            ArtifactRef(kind="json", url=st2.url, bytes=st2.bytes, name="discharge-json")
        )

    return LayerManifest(
        id=layer,
        version=cfg.version,
        generatedAt=iso(cfg.now),
        sourceUpdatedAt=iso(datetime.fromisoformat(f"{today}T00:00:00+00:00")),
        stale=False,
        artifacts=artifacts,
        attribution=ATTRIBUTION,
        coverage="global",
        sample=cfg.sample,
        versions=versions_with(cfg),
        notes=["rivers.ratioSource"],
    )
