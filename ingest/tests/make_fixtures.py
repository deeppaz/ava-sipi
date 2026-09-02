"""One-off: build small test fixtures from raw API snapshots (kept out of git).

Usage: python tests/make_fixtures.py <raw_dir> <ne_dir> <wgms_zip>
"""

from __future__ import annotations

import json
import sys
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
FIX = HERE / "fixtures"


def dump(name: str, data: object) -> None:
    (FIX / name).write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8"
    )


def main(raw: Path, ne: Path, wgms_zip: Path) -> None:
    FIX.mkdir(exist_ok=True)
    # GDACS
    search = json.loads((raw / "gdacs_search.json").read_text(encoding="utf-8"))
    by_type: dict[str, list] = {}
    for f in search["features"]:
        by_type.setdefault(f["properties"]["eventtype"], []).append(f)
    feats = by_type.get("FL", [])[:6] + by_type.get("DR", [])[:2] + by_type.get("TC", [])[:3]
    # make sure at least one orange event exists so the polygon path is exercised
    if not any(f["properties"]["alertlevel"] != "Green" for f in feats):
        feats[0]["properties"]["alertlevel"] = "Orange"
    dump("gdacs_search.json", {"type": "FeatureCollection", "features": feats})
    (FIX / "gdacs_polygon.json").write_bytes((raw / "gdacs_polygon.json").read_bytes())
    rss = (raw / "gdacs_rss.xml").read_text(encoding="utf-8")
    items = rss.split("<item>")
    trimmed = items[0] + "<item>" + "<item>".join(items[1:6])
    if "</channel>" not in trimmed:
        trimmed += "</channel></rss>"
    (FIX / "gdacs_rss.xml").write_text(trimmed, encoding="utf-8")
    # USGS
    d = json.loads((raw / "usgs_latest_00060_p1.json").read_text(encoding="utf-8"))
    dump(
        "usgs_latest_discharge.json", {"type": "FeatureCollection", "features": d["features"][:300]}
    )
    s = json.loads((raw / "usgs_latest_00065_p1.json").read_text(encoding="utf-8"))
    dump("usgs_latest_stage.json", {"type": "FeatureCollection", "features": s["features"][:300]})
    st = json.loads((raw / "usgs_stations_bbox.json").read_text(encoding="utf-8"))
    dump("usgs_stations.json", {"type": "FeatureCollection", "features": st["features"][:200]})
    daily = json.loads((raw / "usgs_daily_01646500.json").read_text(encoding="utf-8"))
    dump("usgs_daily_01646500.json", {"type": "FeatureCollection", "features": daily["features"]})
    # NWPS
    n = json.loads((raw / "nwps_gauges.json").read_text(encoding="utf-8"))
    dump("nwps_gauges.json", {"gauges": n["gauges"][:150]})
    # Open-Meteo
    om = json.loads((raw / "openmeteo_sample.json").read_text(encoding="utf-8"))
    dump("openmeteo_responses.json", om)
    dump(
        "river_points.json",
        [
            {"id": 1, "lat": 35.9, "lon": 39.0, "meanDischarge": 356},
            {"id": 2, "lat": 33.3, "lon": 44.4, "meanDischarge": 1000},
            {"id": 3, "lat": 30.0, "lon": 31.2, "meanDischarge": 2800},
            {"id": 4, "lat": -3.1, "lon": -60.0, "meanDischarge": 209000},
            {"id": 5, "lat": 29.9, "lon": -90.4, "meanDischarge": 16800},
            {"id": 6, "lat": 45.3, "lon": 28.9, "meanDischarge": 6500},
        ],
    )
    # Natural Earth
    rivers = json.loads((ne / "ne_50m_rivers_lake_centerlines.geojson").read_text(encoding="utf-8"))
    keep = {
        "Euphrates",
        "Tigris",
        "Nile",
        "Mississippi",
        "Missouri",
        "Danube",
        "Amazonas",
        "Colorado",
        "Ohio",
        "Yangtze",
        "Chang Jiang",
    }
    rf = [
        f
        for f in rivers["features"]
        if (f["properties"].get("name_en") or f["properties"].get("name")) in keep
    ][:16]
    dump("ne_rivers.json", {"type": "FeatureCollection", "features": rf})
    land = json.loads((ne / "ne_110m_land.geojson").read_text(encoding="utf-8"))
    dump("ne_land.json", land)
    gl = json.loads((ne / "ne_50m_glaciated_areas.geojson").read_text(encoding="utf-8"))
    dump("ne_glaciers.json", {"type": "FeatureCollection", "features": gl["features"][:25]})
    # WGMS regional CSVs
    out = FIX / "wgms_regions"
    out.mkdir(exist_ok=True)
    with zipfile.ZipFile(wgms_zip) as z:
        for info in z.infolist():
            if info.filename.startswith("region/") and info.filename.endswith(".csv"):
                (out / Path(info.filename).name).write_bytes(z.read(info))
        (out / "README.md").write_text(
            "WGMS (2026): Annual mass-change estimates for the world's glaciers, version 2026-02-10. "
            "https://doi.org/10.5904/wgms-amce-2026-02-10 — regional CSVs vendored for tests/sample.\n",
            encoding="utf-8",
        )
    # GWW
    mead = json.loads((raw / "gww_mead.json").read_text(encoding="utf-8"))
    dump("gww_reservoirs.json", mead)
    series = json.loads((raw / "gww_mead_series.json").read_text(encoding="utf-8"))
    dump("gww_series.json", {"90554": series})
    # GDO CDI 512px
    (FIX / "gdo_cdi_512.png").write_bytes((raw / "gdo_cdiad_512.png").read_bytes())
    (FIX / "gdo_time.txt").write_text("2026-06-11", encoding="utf-8")
    # tiny synthetic UNL-like tif: 144 x 60 float32 with -999 nodata (same extent as the real grid)
    rng = np.random.default_rng(7)
    arr = rng.uniform(0, 100, size=(60, 144)).astype(np.float32)
    arr[:, :20] = -999.0
    Image.fromarray(arr, mode="F").save(FIX / "unl_small.tif")
    print("fixtures written to", FIX)


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]))
