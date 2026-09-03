"""HydroRIVERS -> rivers.pmtiles (network, LOD by zoom) + spine.geojson (order >= 7) + points.json.

Full mode needs the `geo` extra (geopandas/pyogrio) and tippecanoe. Sample mode builds a small
Natural Earth spine (see sample.py) so the app works offline.
"""

from __future__ import annotations

import json
import logging
import os
import zipfile
from collections import defaultdict
from pathlib import Path
from typing import Any

from common.config import PipelineConfig, iso
from common.fetch import Fetcher
from common.geo import line_length_km, line_midpoint, round_coords
from common.manifest import ArtifactRef, LayerManifest
from common.pipeline import load_fixture_or, tmp_dir, versions_with, write_json
from common.storage import Storage
from common.tiles import TippecanoeMissingError, tippecanoe
from common.validate import validate

log = logging.getLogger(__name__)

HYDRORIVERS_URL = "https://data.hydrosheds.org/file/HydroRIVERS/HydroRIVERS_v10_shp.zip"
NE_RIVERS_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_rivers_lake_centerlines.geojson"
NE_LAND_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson"
NE_10M_RIVERS_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_rivers_lake_centerlines.geojson"
FIELDS = ["HYRIV_ID", "NEXT_DOWN", "MAIN_RIV", "LENGTH_KM", "DIS_AV_CMS", "ORD_STRA", "UPLAND_SKM"]
MIN_ORDER = 3
SPINE_ORDER = 7
POINTS_ORDER = 6

ATTRIBUTION = {
    "name": "HydroRIVERS v1.0 (HydroSHEDS) · Lehner & Grill 2013",
    "url": "https://www.hydrosheds.org/products/hydrorivers",
    "license": "HydroSHEDS License v1 (free for any use with attribution)",
}
SAMPLE_ATTRIBUTION = {
    "name": "Natural Earth 50m rivers (sample) · published long-term mean discharge",
    "url": "https://www.naturalearthdata.com/downloads/50m-physical-vectors/",
    "license": "Public domain (Natural Earth)",
}

# tippecanoe feature filter implementing the LOD table (spec §5.3):
# zoom < 3 order >= 7; 3-5 order >= 5; 5-7 order >= 4; >= 7 everything (>= 3).
LOD_FILTER = {
    "*": [
        "any",
        [">=", "order", SPINE_ORDER],
        ["all", [">=", "$zoom", 3], [">=", "order", 5]],
        ["all", [">=", "$zoom", 5], [">=", "order", 4]],
        ["all", [">=", "$zoom", 7], [">=", "order", MIN_ORDER]],
    ]
}


# ------------------------------------------------------------------ pure helpers (unit tested)


def merge_chains(segments: list[dict[str, Any]], tolerance: float = 0.25) -> list[dict[str, Any]]:
    """Merge consecutive HydroRIVERS segments into longer spine reaches.

    `segments`: dicts with id, nextDown, order, mean, coords (list of [lon, lat]).
    Two consecutive segments merge when order is equal and mean discharge differs by
    less than `tolerance` (relative). Result keeps a length-weighted mean discharge and the
    upstream-most id. Direction (upstream -> downstream) is preserved.
    """
    by_id = {s["id"]: s for s in segments}
    upstream: dict[int, list[int]] = defaultdict(list)
    for s in segments:
        nd = s.get("nextDown") or 0
        if nd in by_id:
            upstream[nd].append(s["id"])

    def compatible(a: dict[str, Any], b: dict[str, Any]) -> bool:
        if a["order"] != b["order"]:
            return False
        hi, lo = max(a["mean"], b["mean"]), min(a["mean"], b["mean"])
        return hi == 0 or (hi - lo) / hi <= tolerance

    # chain heads: segments whose upstream neighbours are not merge-compatible (or none)
    consumed: set[int] = set()
    out: list[dict[str, Any]] = []
    ordered = sorted(segments, key=lambda s: (-s["order"], -s["mean"], s["id"]))
    for s in ordered:
        if s["id"] in consumed:
            continue
        # walk upstream to find the head of this compatible chain
        head = s
        guard = 0
        while guard < 100000:
            ups = [
                by_id[u]
                for u in upstream.get(head["id"], [])
                if u not in consumed and compatible(by_id[u], head)
            ]
            if len(ups) != 1:
                break
            head = ups[0]
            guard += 1
        # walk downstream from head while compatible and single-parent
        chain = [head]
        consumed.add(head["id"])
        cur = head
        while True:
            nd = cur.get("nextDown") or 0
            nxt = by_id.get(nd)
            if not nxt or nxt["id"] in consumed or not compatible(cur, nxt):
                break
            others = [
                u
                for u in upstream.get(nxt["id"], [])
                if u != cur["id"] and compatible(by_id[u], nxt)
            ]
            if others:
                break  # nxt is a confluence of two similar reaches; start a new reach there
            chain.append(nxt)
            consumed.add(nxt["id"])
            cur = nxt
        coords: list[list[float]] = []
        total_len = 0.0
        weighted = 0.0
        for seg in chain:
            c = seg["coords"]
            if coords and coords[-1] == c[0]:
                c = c[1:]
            coords.extend(c)
            ln = seg.get("lengthKm") or line_length_km(seg["coords"]) or 1.0
            total_len += ln
            weighted += seg["mean"] * ln
        out.append(
            {
                "id": head["id"],
                "order": head["order"],
                "mean": weighted / total_len if total_len else head["mean"],
                "lengthKm": total_len,
                "coords": coords,
                "nextDown": chain[-1].get("nextDown") or 0,
                "mainRiver": head.get("mainRiver"),
                "name": next((seg.get("name") for seg in chain if seg.get("name")), None),
            }
        )
    return out


def simplify_line(coords: list[list[float]], tolerance: float) -> list[list[float]]:
    """Douglas-Peucker on lon/lat (degrees). Keeps endpoints."""
    if len(coords) <= 2:
        return coords

    def perp(p: list[float], a: list[float], b: list[float]) -> float:
        dx, dy = b[0] - a[0], b[1] - a[1]
        if dx == 0 and dy == 0:
            return ((p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2) ** 0.5
        t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)
        t = max(0.0, min(1.0, t))
        px, py = a[0] + t * dx, a[1] + t * dy
        return ((p[0] - px) ** 2 + (p[1] - py) ** 2) ** 0.5

    stack = [(0, len(coords) - 1)]
    keep = [False] * len(coords)
    keep[0] = keep[-1] = True
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        dmax, idx = 0.0, -1
        for k in range(i + 1, j):
            d = perp(coords[k], coords[i], coords[j])
            if d > dmax:
                dmax, idx = d, k
        if dmax > tolerance and idx > 0:
            keep[idx] = True
            stack.append((i, idx))
            stack.append((idx, j))
    return [c for c, k in zip(coords, keep, strict=False) if k]


def spine_feature(reach: dict[str, Any], tolerance: float = 0.01) -> dict[str, Any]:
    coords = simplify_line(reach["coords"], tolerance)
    props: dict[str, Any] = {
        "id": int(reach["id"]),
        "order": int(reach["order"]),
        "meanDischarge": round(float(reach["mean"]), 2),
        "lengthKm": round(float(reach["lengthKm"]), 1),
    }
    if reach.get("nextDown") is not None:
        props["nextDown"] = int(reach["nextDown"])
    if reach.get("mainRiver") is not None:
        props["mainRiver"] = int(reach["mainRiver"])
    if reach.get("name"):
        props["name"] = reach["name"]
    return {
        "type": "Feature",
        "id": props["id"],
        "geometry": round_coords({"type": "LineString", "coordinates": coords}, 3),
        "properties": props,
    }


def discharge_points(
    features: list[dict[str, Any]], min_order: int = POINTS_ORDER, limit: int | None = None
) -> list[dict[str, Any]]:
    pts = []
    for f in features:
        p = f["properties"]
        if p["order"] < min_order:
            continue
        lon, lat = line_midpoint(f["geometry"]["coordinates"])
        pts.append(
            {
                "id": p["id"],
                "lon": round(lon, 4),
                "lat": round(lat, 4),
                "meanDischarge": p["meanDischarge"],
            }
        )
    pts.sort(key=lambda p: -p["meanDischarge"])
    return pts[:limit] if limit else pts


# ------------------------------------------------------------------ full pipeline


def _download_hydrorivers(fetcher: Fetcher, cache: Path) -> Path:
    zip_path = cache / "HydroRIVERS_v10_shp.zip"
    if not zip_path.exists():
        log.info("downloading HydroRIVERS (~544 MB)")
        fetcher.download(HYDRORIVERS_URL, zip_path, use_cache=False)
    extract = cache / "HydroRIVERS_v10_shp"
    if not extract.exists():
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(extract)
    shp = next(extract.rglob("HydroRIVERS_v10.shp"))
    return shp


def _name_lookup(fetcher: Fetcher, cache: Path):
    """Natural Earth 10m named rivers as a GeoDataFrame for nearest-name join (major rivers)."""
    import geopandas as gpd

    p = cache / "ne_10m_rivers.geojson"
    if not p.exists():
        fetcher.download(NE_10M_RIVERS_URL, p)
    gdf = gpd.read_file(p)
    gdf = gdf[gdf["featurecla"].str.startswith("River", na=False)][["name_en", "name", "geometry"]]
    gdf["rname"] = gdf["name_en"].fillna(gdf["name"])  # pyright: ignore[reportAttributeAccessIssue, reportArgumentType]
    return gdf[["rname", "geometry"]].to_crs(3857)  # pyright: ignore[reportAttributeAccessIssue]


def run_full(cfg: PipelineConfig) -> tuple[dict[str, Any], list[dict[str, Any]], Path | None]:
    import geopandas as gpd
    from pyogrio import read_dataframe, write_dataframe

    cache = cfg.out_dir / ".cache" / "rivers"
    cache.mkdir(parents=True, exist_ok=True)
    tmp = tmp_dir(cfg, "rivers")
    with Fetcher(cache_dir=cache, per_second=2, timeout=600) as fetcher:
        shp = _download_hydrorivers(fetcher, cache)
        log.info("reading %s (ORD_STRA >= %d)", shp, MIN_ORDER)
        gdf = read_dataframe(shp, columns=FIELDS, where=f"ORD_STRA >= {MIN_ORDER}")
        gdf = gdf.rename(
            columns={
                "HYRIV_ID": "id",
                "NEXT_DOWN": "nextDown",
                "MAIN_RIV": "mainRiver",
                "LENGTH_KM": "lengthKm",
                "DIS_AV_CMS": "meanDischarge",
                "ORD_STRA": "order",
                "UPLAND_SKM": "uplandKm2",
            }
        )
        # names for big rivers via nearest Natural Earth centreline (<= 5 km)
        names = _name_lookup(fetcher, cache)
        big = gdf[gdf["order"] >= POINTS_ORDER].to_crs(3857)
        joined = gpd.sjoin_nearest(big, names, how="left", max_distance=5000)
        name_map = joined.groupby("id")["rname"].first().dropna().to_dict()
        gdf["name"] = gdf["id"].map(name_map)

    # ---- network tiles
    # pyogrio writes GeoJSONSeq in C. Serialising millions of reaches row by row in Python
    # (a GeoSeries per row) took hours and blew the job budget.
    net_path = tmp / "network.geojsonseq"
    net = gdf[["id", "order", "meanDischarge", "name", "geometry"]].copy()
    net["meanDischarge"] = net["meanDischarge"].astype(float).round(3)
    log.info("writing %d reaches to %s", len(net), net_path.name)
    write_dataframe(net, net_path, driver="GeoJSONSeq")
    filter_path = tmp / "lod.json"
    filter_path.write_text(json.dumps(LOD_FILTER), encoding="utf-8")
    pm: Path | None = None
    try:
        pm = tippecanoe(
            [net_path],
            tmp / "rivers.pmtiles",
            layer="rivers",
            minzoom=1,
            maxzoom=10,
            include=["id", "order", "meanDischarge", "name"],
            extra=["-J", str(filter_path), "--use-attribute-for-id=id", "-P"],
        )
    except TippecanoeMissingError:
        log.warning("tippecanoe missing: network PMTiles skipped")

    # ---- spine
    spine_rows = gdf[gdf["order"] >= SPINE_ORDER]
    segments = []
    for row in spine_rows.itertuples(index=False):
        coords = (
            [[float(x), float(y)] for x, y in row.geometry.coords]
            if row.geometry.geom_type == "LineString"
            else [[float(x), float(y)] for part in row.geometry.geoms for x, y in part.coords]
        )
        segments.append(
            {
                "id": int(row.id),
                "nextDown": int(row.nextDown),
                "mainRiver": int(row.mainRiver),
                "order": int(row.order),
                "mean": float(row.meanDischarge),
                "lengthKm": float(row.lengthKm),
                "coords": coords,
                "name": getattr(row, "name", None),
            }
        )
    reaches = merge_chains(segments)
    features = [spine_feature(r) for r in reaches]
    # discharge sample points: rank by mean discharge first, then walk only the ones we keep
    limit = int(os.environ.get("RIVER_POINTS_LIMIT", "30000"))
    candidates = gdf[gdf["order"] >= POINTS_ORDER].nlargest(limit, "meanDischarge")
    pts = []
    for row in candidates.itertuples(index=False):
        g = (
            row.geometry
            if row.geometry.geom_type == "LineString"
            else max(row.geometry.geoms, key=lambda p: p.length)
        )
        lon, lat = line_midpoint([[float(x), float(y)] for x, y in g.coords])
        pts.append(
            {
                "id": int(row.id),
                "lon": round(lon, 4),
                "lat": round(lat, 4),
                "meanDischarge": round(float(row.meanDischarge), 3),
            }
        )
    pts.sort(key=lambda p: -p["meanDischarge"])
    return {"type": "FeatureCollection", "features": features}, pts, pm


# ------------------------------------------------------------------ sample pipeline


def run_sample(cfg: PipelineConfig) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    from .sample import build_sample_spine

    with Fetcher(cache_dir=cfg.out_dir / ".cache", per_second=2, timeout=120) as fetcher:
        ne_rivers = load_fixture_or(cfg, "ne_rivers", lambda: fetcher.get_json(NE_RIVERS_URL))
        ne_land = load_fixture_or(cfg, "ne_land", lambda: fetcher.get_json(NE_LAND_URL))
    return build_sample_spine(ne_rivers, ne_land)


def run(cfg: PipelineConfig) -> LayerManifest:
    layer = "rivers"
    storage = Storage(cfg.out_dir, cfg.public_base_url, cfg.publish)
    tmp = tmp_dir(cfg, "rivers")
    artifacts: list[ArtifactRef] = []
    notes: list[str] = []
    pm: Path | None = None
    if cfg.sample or "ne_rivers" in cfg.fixtures:
        spine, points = run_sample(cfg)
        attribution = SAMPLE_ATTRIBUTION
        notes += ["rivers.sampleGeometry", "rivers.sampleDischarge"]
    else:
        spine, points, pm = run_full(cfg)
        attribution = ATTRIBUTION
        if pm is None:
            notes.append("rivers.noNetworkTiles")
    validate("river-spine", spine)
    sp = write_json(tmp / "spine.geojson", spine)
    st = storage.put(sp, layer, cfg.version, "spine.geojson", cache_seconds=86400)
    artifacts.append(ArtifactRef(kind="geojson", url=st.url, bytes=st.bytes, name="spine"))
    pp = write_json(tmp / "points.json", points)
    st = storage.put(pp, layer, cfg.version, "points.json", cache_seconds=86400)
    artifacts.append(ArtifactRef(kind="json", url=st.url, bytes=st.bytes, name="points"))
    if pm is not None:
        st = storage.put(pm, layer, cfg.version, "rivers.pmtiles", cache_seconds=86400)
        artifacts.append(ArtifactRef(kind="pmtiles", url=st.url, bytes=st.bytes, name="network"))
    return LayerManifest(
        id=layer,
        version=cfg.version,
        generatedAt=iso(cfg.now),
        sourceUpdatedAt=iso(cfg.now),
        stale=False,
        artifacts=artifacts,
        attribution=attribution,
        coverage="global",
        legend={
            "unit": "ratio",
            "stops": [
                {"value": 0.3, "color": "#7A4A1C", "label": "0.3×"},
                {"value": 0.6, "color": "#C8873A", "label": "0.6×"},
                {"value": 1.0, "color": "#7FB8D6", "label": "1×"},
                {"value": 1.6, "color": "#35E0E0", "label": "1.6×"},
                {"value": 3.0, "color": "#EAF4F8", "label": "3×"},
            ],
        },
        sample=cfg.sample,
        versions=versions_with(cfg),
        notes=notes,
    )
