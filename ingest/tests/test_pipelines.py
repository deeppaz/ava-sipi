"""Every pipeline runs on fixtures and its output validates against the shared JSON Schemas."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import pytest

from common.config import PipelineConfig
from common.manifest import ArtifactRef, LayerManifest
from common.validate import validate
from pipelines.discharge_openmeteo.run import build_records
from pipelines.discharge_openmeteo.run import run as run_discharge
from pipelines.drought_gdo.run import latest_time
from pipelines.drought_gdo.run import run as run_drought
from pipelines.events_gdacs.run import run as run_events
from pipelines.gauges_noaa.run import normalize
from pipelines.gauges_noaa.run import run as run_noaa
from pipelines.gauges_usgs.run import build_latest, monthly_quantiles
from pipelines.gauges_usgs.run import run as run_usgs
from pipelines.glaciers_rgi.run import latest_mwe_by_region, parse_wgms_regions, region_for
from pipelines.glaciers_rgi.run import run as run_glaciers
from pipelines.groundwater_grace.run import grid_from_unl_tif, unl_latest_folder
from pipelines.groundwater_grace.run import run as run_groundwater
from pipelines.reservoirs_gww.run import derive
from pipelines.reservoirs_gww.run import run as run_reservoirs
from pipelines.rivers.run import discharge_points, merge_chains, simplify_line, spine_feature
from pipelines.rivers.run import run as run_rivers


def _read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


# ---------------------------------------------------------------- events


def test_events_pipeline(cfg: PipelineConfig, fixtures_dir: Path):
    cfg.fixtures = {
        "gdacs_search": fixtures_dir / "gdacs_search.json",
        "gdacs_rss": fixtures_dir / "gdacs_rss.xml",
        "gdacs_polygon": fixtures_dir / "gdacs_polygon.json",
    }
    m = run_events(cfg)
    assert m.id == "events" and m.artifacts[0].kind == "geojson"
    fc = _read(cfg.out_dir / m.artifacts[0].url)
    validate("water-event-collection", fc)
    assert len(fc["features"]) >= 5
    types = {f["properties"]["type"] for f in fc["features"]}
    assert types <= {"flood", "drought", "cyclone"}
    assert any(f["geometry"]["type"] in ("Polygon", "MultiPolygon") for f in fc["features"])
    assert all(f["properties"]["startedAt"].endswith("Z") for f in fc["features"])


# ---------------------------------------------------------------- gauges


def test_noaa_normalize(fixtures_dir: Path):
    raw = _read(fixtures_dir / "nwps_gauges.json")
    recs = normalize(raw)
    assert recs and all(
        r["floodCategory"] in {"none", "action", "minor", "moderate", "major"} for r in recs
    )
    with_stage = [r for r in recs if "stageM" in r]
    assert with_stage and all(r["stageM"] < 2000 for r in with_stage)


def test_noaa_pipeline(cfg: PipelineConfig, fixtures_dir: Path):
    cfg.fixtures = {"nwps_gauges": fixtures_dir / "nwps_gauges.json"}
    m = run_noaa(cfg)
    assert (cfg.out_dir / "gauges" / "latest" / "noaa.json").exists()
    assert m.coverage == "regional"


def test_monthly_quantiles_from_daily_fixture(fixtures_dir: Path):
    from collections import defaultdict

    from common.units import cfs_to_m3s

    feats = _read(fixtures_dir / "usgs_daily_01646500.json")["features"]
    by_month: dict[int, list[float]] = defaultdict(list)
    for f in feats:
        p = f["properties"]
        if p.get("value") not in (None, ""):
            by_month[int(p["time"][5:7]) - 1].append(cfs_to_m3s(float(p["value"])))
    q = monthly_quantiles(by_month)
    assert len(q) == 12
    filled = [m for m in q if m]
    assert filled and all(a <= b for m in filled for a, b in zip(m, m[1:], strict=False))


def test_build_latest_joins_and_converts(fixtures_dir: Path):
    discharge = _read(fixtures_dir / "usgs_latest_discharge.json")["features"]
    stage = _read(fixtures_dir / "usgs_latest_stage.json")["features"]
    sid = discharge[0]["properties"]["monitoring_location_id"]
    stations = {sid: {"id": sid, "name": "TEST RIVER AT TOWN", "riverName": "Test River"}}
    stats = {sid: [[0.1, 0.2, 0.5, 1.0, 2.0, 5.0, 10.0]] * 12}
    noaa = {sid.replace("USGS-", ""): {"lid": "TSTX1", "floodCategory": "minor"}}
    now = datetime.fromisoformat(discharge[0]["properties"]["time"])
    gauges = build_latest(discharge, stage, stations, stats, noaa, now)
    g = next(x for x in gauges if x["id"] == sid)
    assert g["discharge"]["unit"] == "m3/s"
    assert g["name"] == "TEST RIVER AT TOWN" and g["riverName"] == "Test River"
    assert 0 <= g["percentile"] <= 100
    assert g["floodCategory"] == "minor" and g["nwsLid"] == "TSTX1"
    validate(
        "gauges-latest",
        {"generatedAt": "2026-09-02T15:00:00Z", "count": len(gauges), "gauges": gauges},
    )


def test_usgs_pipeline(cfg: PipelineConfig, fixtures_dir: Path):
    cfg.now = datetime(2026, 9, 2, 16, 0, tzinfo=UTC)
    cfg.fixtures = {
        "usgs_latest_discharge": fixtures_dir / "usgs_latest_discharge.json",
        "usgs_latest_stage": fixtures_dir / "usgs_latest_stage.json",
        "usgs_stations": fixtures_dir / "usgs_stations.json",
    }
    m = run_usgs(cfg)
    doc = _read(cfg.out_dir / "gauges" / "latest" / "latest.json")
    validate("gauges-latest", doc)
    assert doc["count"] > 100
    assert "gauges.noPercentiles" in m.notes


# ---------------------------------------------------------------- discharge


def test_build_records_ratio(fixtures_dir: Path):
    points = _read(fixtures_dir / "river_points.json")
    responses = _read(fixtures_dir / "openmeteo_responses.json")
    recs = build_records(points, responses, "2026-09-02")
    assert len(recs) == len(points)
    assert all(0 <= r["ratio"] <= 12 for r in recs)
    assert all(len(r["forecast"]) <= 7 for r in recs)


def test_discharge_pipeline(cfg: PipelineConfig, fixtures_dir: Path):
    cfg.fixtures = {
        "river_points": fixtures_dir / "river_points.json",
        "openmeteo_responses": fixtures_dir / "openmeteo_responses.json",
    }
    m = run_discharge(cfg)
    kinds = {a.kind for a in m.artifacts}
    assert kinds == {"parquet", "json"}
    import pyarrow.parquet as pq

    table = pq.read_table(cfg.out_dir / m.artifacts[0].url)
    assert table.num_rows == 6 and "ratio" in table.column_names


# ---------------------------------------------------------------- rivers


def test_merge_chains_and_spine():
    # A -> B -> C (compatible), D joins at C with different order
    segs = [
        {
            "id": 1,
            "nextDown": 2,
            "order": 7,
            "mean": 100,
            "coords": [[0, 0], [1, 0]],
            "lengthKm": 1,
        },
        {
            "id": 2,
            "nextDown": 3,
            "order": 7,
            "mean": 110,
            "coords": [[1, 0], [2, 0]],
            "lengthKm": 1,
        },
        {
            "id": 3,
            "nextDown": 0,
            "order": 7,
            "mean": 105,
            "coords": [[2, 0], [3, 0]],
            "lengthKm": 1,
        },
        {
            "id": 4,
            "nextDown": 3,
            "order": 8,
            "mean": 900,
            "coords": [[2, 1], [2, 0]],
            "lengthKm": 1,
        },
    ]
    reaches = merge_chains(segs)
    ids = sorted(r["id"] for r in reaches)
    assert ids == [1, 4]
    r1 = next(r for r in reaches if r["id"] == 1)
    assert r1["coords"] == [[0, 0], [1, 0], [2, 0], [3, 0]]
    assert 100 <= r1["mean"] <= 110
    feat = spine_feature(r1)
    validate("river-spine", {"type": "FeatureCollection", "features": [feat]})
    assert discharge_points([feat])[0]["id"] == 1


def test_simplify_line():
    line = [[0, 0], [1, 0.001], [2, 0], [3, 5], [4, 0]]
    out = simplify_line(line, 0.01)
    assert out[0] == [0, 0] and out[-1] == [4, 0] and [3, 5] in out and [1, 0.001] not in out


def test_rivers_sample_pipeline(cfg: PipelineConfig, fixtures_dir: Path):
    cfg.fixtures = {
        "ne_rivers": fixtures_dir / "ne_rivers.json",
        "ne_land": fixtures_dir / "ne_land.json",
    }
    m = run_rivers(cfg)
    spine = _read(cfg.out_dir / "rivers" / "latest" / "spine.geojson")
    validate("river-spine", spine)
    names = {f["properties"].get("name") for f in spine["features"]}
    assert "Euphrates" in names or "Tigris" in names
    pts = _read(cfg.out_dir / "rivers" / "latest" / "points.json")
    assert pts and pts[0]["meanDischarge"] >= pts[-1]["meanDischarge"]
    assert "rivers.sampleDischarge" in m.notes
    # Euphrates must flow south-east: last vertex further south than first
    eu = next(f for f in spine["features"] if f["properties"].get("name") == "Euphrates")
    assert eu["geometry"]["coordinates"][-1][1] < eu["geometry"]["coordinates"][0][1]


# ---------------------------------------------------------------- reservoirs


def test_derive_fill():
    now = datetime(2026, 9, 2, tzinfo=UTC)
    series = [
        {"t": f"2026-0{m}-01T00:00:00", "value": v * 1e6}
        for m, v in ((1, 300), (2, 310), (3, 320), (4, 330), (5, 300), (6, 280))
    ]
    d = derive(series, now)
    assert d["areaKm2"] == 280 and 80 < d["fillPct"] < 90 and d["trend90d"] < 0


def test_reservoirs_pipeline(cfg: PipelineConfig, fixtures_dir: Path):
    cfg.fixtures = {
        "gww_reservoirs": fixtures_dir / "gww_reservoirs.json",
        "gww_series": fixtures_dir / "gww_series.json",
    }
    m = run_reservoirs(cfg)
    doc = _read(cfg.out_dir / "reservoirs" / "latest" / "latest.json")
    validate("reservoirs-latest", doc)
    r = doc["reservoirs"][0]
    assert r["name"] == "Lake Mead" and 0 < r["fillPct"] <= 100 and r["grandId"] == 610
    series = _read(cfg.out_dir / r["seriesUrl"])
    validate("reservoir-series", series)
    assert "reservoirs.proxy" in m.notes


# ---------------------------------------------------------------- glaciers


def test_wgms_regions(fixtures_dir: Path):
    d = fixtures_dir / "wgms_regions"
    csvs = {p.stem: p.read_text(encoding="utf-8") for p in d.glob("*.csv")}
    regions = parse_wgms_regions(csvs)
    assert {r["region"] for r in regions} >= {"01", "11", "17", "19"}
    latest = latest_mwe_by_region(regions)
    assert latest["11"] < 0  # Central Europe has been losing mass every recent year
    assert region_for(10.5, 46.5) == "11" and region_for(-150, 62) == "01"


def test_glaciers_sample_pipeline(cfg: PipelineConfig, fixtures_dir: Path):
    cfg.fixtures = {
        "ne_glaciers": fixtures_dir / "ne_glaciers.json",
        "wgms_regions_dir": fixtures_dir / "wgms_regions",
    }
    m = run_glaciers(cfg)
    fc = _read(cfg.out_dir / "glaciers" / "latest" / "glaciers.geojson")
    validate("glacier-collection", fc)
    assert fc["features"] and all("region" in f["properties"] for f in fc["features"])
    mb = _read(cfg.out_dir / "glaciers" / "latest" / "massbalance.json")
    validate("mass-balance", mb)
    assert {a.name for a in m.artifacts} == {"massbalance", "outlines"}


# ---------------------------------------------------------------- drought


def test_latest_time_parsing():
    xml = '<Layer><Name>cdiad</Name><Extent name="time" nearestValue="0">2012-01-01/2026-06-11/P10D</Extent></Layer>'
    assert latest_time(xml, "cdiad") == "2026-06-11"
    assert latest_time(xml, "nope") is None


def test_drought_pipeline(cfg: PipelineConfig, fixtures_dir: Path):
    cfg.fixtures = {
        "gdo_cdi_png": fixtures_dir / "gdo_cdi_512.png",
        "gdo_time": fixtures_dir / "gdo_time.txt",
    }
    m = run_drought(cfg)
    names = {a.name for a in m.artifacts}
    assert {"cdi", "cdi-tiles"} <= names
    assert m.sourceUpdatedAt.startswith("2026-06-11")
    png = next(a for a in m.artifacts if a.name == "cdi")
    assert png.bbox and png.bbox[1] == pytest.approx(-85.0511, abs=1e-3)
    import numpy as np
    from PIL import Image

    arr = np.asarray(Image.open(cfg.out_dir / png.url).convert("RGBA"))
    opaque = arr[arr[..., 3] > 0][:, :3]
    rgbs = {tuple(int(x) for x in row) for row in np.unique(opaque, axis=0)}
    assert rgbs <= {(0xD9, 0xA4, 0x5B), (0xC8, 0x87, 0x3A), (0x7A, 0x4A, 0x1C)}


# ---------------------------------------------------------------- groundwater


def test_unl_helpers(fixtures_dir: Path):
    assert (
        unl_latest_folder('<a href="20260803/">20260803/</a><a href="20260810/">x</a>')
        == "20260810"
    )
    grid = grid_from_unl_tif((fixtures_dir / "unl_small.tif").read_bytes())
    assert grid.cols == 144 and grid.dlon == 2.5 and grid.value_at(-170, 80) is None
    assert 0 <= (grid.value_at(100, 40) or 0) <= 100


def test_groundwater_fallback_pipeline(cfg: PipelineConfig, fixtures_dir: Path):
    cfg.fixtures = {"unl_tif": fixtures_dir / "unl_small.tif"}
    m = run_groundwater(cfg)
    assert m.legend and m.legend["unit"] == "percentile"
    assert "groundwater.percentileFallback" in m.notes
    assert {a.kind for a in m.artifacts} == {"png", "raster-pmtiles"}


# ---------------------------------------------------------------- manifest merge


def test_a_rerun_drops_its_own_stale_note(cfg: PipelineConfig, fixtures_dir: Path, tmp_path: Path):
    """A pipeline that now produces tiles must not inherit "no tiles were built" from its own
    previous run, while a sibling pipeline's note on the same layer survives."""
    import argparse

    from cli import cmd_run
    from common.manifest import write_layer_manifest
    from pipelines import owned_notes

    manifests = tmp_path / "manifests"
    stale = LayerManifest(
        id="rivers",
        version="20260101T0000",
        generatedAt="2026-01-01T00:00:00Z",
        sourceUpdatedAt="2026-01-01T00:00:00Z",
        stale=False,
        artifacts=[
            ArtifactRef(kind="parquet", url="discharge/latest/x.parquet", bytes=1, name="discharge")
        ],
        attribution={"name": "x", "url": "https://x", "license": "x"},
        coverage="global",
        notes=["rivers.noNetworkTiles", "rivers.ratioSource"],
    )
    write_layer_manifest(stale, manifests)

    cfg.fixtures = {
        "ne_rivers": fixtures_dir / "ne_rivers.json",
        "ne_land": fixtures_dir / "ne_land.json",
    }
    args = argparse.Namespace(
        pipelines=["rivers"],
        out=str(cfg.out_dir),
        manifests=str(manifests),
        publish=False,
        sample=True,
    )
    assert cmd_run(args) == 0

    merged = json.loads((manifests / "rivers.json").read_text(encoding="utf-8"))
    assert "rivers.noNetworkTiles" not in merged["notes"]  # owned by rivers, this run decided
    assert "rivers.ratioSource" in merged["notes"]  # the discharge pipeline still owns it
    assert {a["name"] for a in merged["artifacts"]} >= {"spine", "points", "discharge"}
    assert "rivers.noNetworkTiles" in owned_notes("rivers")
