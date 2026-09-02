"""Open-Meteo Flood API (GloFAS) -> discharge/YYYYMMDD.parquet: ratio = today / mean discharge.

Points come from the rivers pipeline (`rivers/latest/points.json`): midpoints of HydroRIVERS
segments with ORD_STRA >= 6 (spine segments in sample mode).
"""

from __future__ import annotations

import json
import logging
import math
import os
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
PAST_DAYS = 30
FORECAST_DAYS = 7
RATIO_CAP = 12.0

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


def build_records(
    points: list[dict[str, Any]], responses: list[dict[str, Any]], today: str
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for pt, resp in zip(points, responses, strict=False):
        daily = (resp or {}).get("daily") or {}
        times: list[str] = daily.get("time") or []
        vals: list[float | None] = daily.get("river_discharge") or []
        if not times or not vals:
            continue
        series = {
            t: v for t, v in zip(times, vals, strict=False) if v is not None and not math.isnan(v)
        }
        # "today" = the last past day with a value (GloFAS lags ~1 day)
        past = [t for t in times if t <= today and t in series]
        if not past:
            continue
        t0 = past[-1]
        today_val = float(series[t0])
        mean = float(pt.get("meanDischarge") or 0)
        ratio = min(RATIO_CAP, today_val / mean) if mean > 0 else 1.0
        forecast = [round(float(series[t]), 3) for t in times if t > t0 and t in series][
            :FORECAST_DAYS
        ]
        records.append(
            {
                "id": int(pt["id"]),
                "ratio": round(ratio, 4),
                "today": round(today_val, 3),
                "forecast": forecast,
                "lat": round(float(pt["lat"]), 4),
                "lon": round(float(pt["lon"]), 4),
            }
        )
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

    today = cfg.now.astimezone(UTC).strftime("%Y-%m-%d")
    responses: list[dict[str, Any]] = []
    if "openmeteo_responses" in cfg.fixtures:
        responses = load_fixture_or(cfg, "openmeteo_responses", lambda: [])
    else:
        api_key = os.environ.get("OPEN_METEO_API_KEY") or None
        with Fetcher(cache_dir=cfg.out_dir / ".cache", per_second=4, timeout=90) as fetcher:
            for batch in _chunks(points, BATCH):
                try:
                    responses.extend(fetch_batch(fetcher, batch, api_key))
                except FetchError as exc:
                    log.warning("open-meteo batch failed: %s", exc)
                    responses.extend([{} for _ in batch])
    records = build_records(points, responses, today)
    doc = {"day": today, "source": "open-meteo-flood", "records": records}
    validate("discharge-file", doc)

    tmp = tmp_dir(cfg, "discharge")
    storage = Storage(cfg.out_dir, cfg.public_base_url, cfg.publish)
    stamp = today.replace("-", "")
    artifacts: list[ArtifactRef] = []
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
