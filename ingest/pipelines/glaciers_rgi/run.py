"""RGI 7.0 glacier outlines -> glaciers.pmtiles / glaciers.geojson; WGMS -> massbalance.json."""

from __future__ import annotations

import csv
import io
import logging
import zipfile
from pathlib import Path
from typing import Any

from common.config import PipelineConfig, iso
from common.fetch import Fetcher, FetchError
from common.geo import polygon_centroid, round_coords
from common.manifest import ArtifactRef, LayerManifest
from common.pipeline import load_fixture_or, tmp_dir, versions_with, write_json
from common.storage import Storage
from common.tiles import TippecanoeMissingError, tippecanoe
from common.validate import validate

log = logging.getLogger(__name__)

WGMS_AMCE_URL = "https://wgms.ch/downloads/wgms-amce-2026-02-10.zip"
WGMS_DOI = "https://doi.org/10.5904/wgms-amce-2026-02-10"
NE_GLACIERS_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_glaciated_areas.geojson"
RGI_NSIDC_BASE = (
    "https://daacdata.apps.nsidc.org/pub/DATASETS/nsidc0770_rgi_v7/regional_files/RGI2000-v7.0-G/"
)
RGI_REGION_FILES = {
    "01": "RGI2000-v7.0-G-01_alaska.zip",
    "02": "RGI2000-v7.0-G-02_western_canada_usa.zip",
    "03": "RGI2000-v7.0-G-03_arctic_canada_north.zip",
    "04": "RGI2000-v7.0-G-04_arctic_canada_south.zip",
    "05": "RGI2000-v7.0-G-05_greenland_periphery.zip",
    "06": "RGI2000-v7.0-G-06_iceland.zip",
    "07": "RGI2000-v7.0-G-07_svalbard_jan_mayen.zip",
    "08": "RGI2000-v7.0-G-08_scandinavia.zip",
    "09": "RGI2000-v7.0-G-09_russian_arctic.zip",
    "10": "RGI2000-v7.0-G-10_north_asia.zip",
    "11": "RGI2000-v7.0-G-11_central_europe.zip",
    "12": "RGI2000-v7.0-G-12_caucasus_middle_east.zip",
    "13": "RGI2000-v7.0-G-13_central_asia.zip",
    "14": "RGI2000-v7.0-G-14_south_asia_west.zip",
    "15": "RGI2000-v7.0-G-15_south_asia_east.zip",
    "16": "RGI2000-v7.0-G-16_low_latitudes.zip",
    "17": "RGI2000-v7.0-G-17_southern_andes.zip",
    "18": "RGI2000-v7.0-G-18_new_zealand.zip",
    "19": "RGI2000-v7.0-G-19_subantarctic_antarctic_islands.zip",
}
# WGMS/GlaMBIE region codes -> RGI first-order region + display name
WGMS_REGIONS: dict[str, tuple[str, str]] = {
    "ALA": ("01", "Alaska"),
    "WNA": ("02", "Western Canada & USA"),
    "ACN": ("03", "Arctic Canada North"),
    "ACS": ("04", "Arctic Canada South"),
    "GRL": ("05", "Greenland Periphery"),
    "ISL": ("06", "Iceland"),
    "SJM": ("07", "Svalbard & Jan Mayen"),
    "SCA": ("08", "Scandinavia"),
    "RUA": ("09", "Russian Arctic"),
    "ASN": ("10", "North Asia"),
    "CEU": ("11", "Central Europe"),
    "CAU": ("12", "Caucasus & Middle East"),
    "ASC": ("13", "Central Asia"),
    "ASW": ("14", "South Asia West"),
    "ASE": ("15", "South Asia East"),
    "TRP": ("16", "Low Latitudes"),
    "SA1": ("17", "Southern Andes (north)"),
    "SA2": ("17", "Southern Andes (south)"),
    "NZL": ("18", "New Zealand"),
    "ANT": ("19", "Antarctic & Subantarctic"),
}
# Approximate RGI first-order region boxes [west, south, east, north] for sample-mode assignment.
REGION_BOXES: list[tuple[str, tuple[float, float, float, float]]] = [
    ("01", (-180, 52, -128, 72)),
    ("02", (-140, 36, -100, 62)),
    ("03", (-125, 74, -55, 84)),
    ("04", (-95, 58, -58, 74)),
    ("05", (-75, 59, -10, 84)),
    ("06", (-26, 63, -12, 67)),
    ("07", (-10, 70, 35, 82)),
    ("08", (4, 58, 32, 72)),
    ("09", (35, 70, 110, 83)),
    ("10", (60, 45, 180, 75)),
    ("11", (-2, 43, 20, 49)),
    ("12", (30, 30, 60, 46)),
    ("13", (60, 34, 100, 50)),
    ("14", (60, 26, 82, 40)),
    ("15", (75, 26, 105, 34)),
    ("16", (-100, -25, 60, 25)),
    ("17", (-80, -56, -60, -25)),
    ("18", (165, -48, 180, -40)),
    ("19", (-180, -90, 180, -45)),
]

ATTRIBUTION = {
    "name": "Randolph Glacier Inventory v7.0 (RGI Consortium 2023, GLIMS/NSIDC) · WGMS annual mass-change estimates (2026)",
    "url": "https://doi.org/10.5067/f6jmovy5navz",
    "license": "CC BY 4.0 (RGI 7.0) · WGMS open access with citation (doi:10.5904/wgms-amce-2026-02-10)",
}
SAMPLE_ATTRIBUTION = {
    "name": "Natural Earth 50m glaciated areas (sample) · WGMS annual mass-change estimates (2026)",
    "url": "https://www.naturalearthdata.com/downloads/50m-physical-vectors/",
    "license": "Public domain (Natural Earth) · WGMS open access with citation",
}


def region_for(lon: float, lat: float) -> str:
    for code, (w, s, e, n) in REGION_BOXES:
        if w <= lon <= e and s <= lat <= n:
            return code
    return "16" if abs(lat) < 30 else ("19" if lat < 0 else "10")


def _area_km2_approx(geom: dict[str, Any]) -> float:
    """Approximate planar area with latitude correction (sample data only)."""
    import math

    def ring_area(ring: list[list[float]]) -> float:
        a = 0.0
        for i in range(len(ring) - 1):
            x0, y0 = ring[i]
            x1, y1 = ring[i + 1]
            a += x0 * y1 - x1 * y0
        return abs(a) / 2

    polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
    total = 0.0
    for poly in polys:
        outer = poly[0]
        _cx, cy = polygon_centroid(outer)
        deg2 = ring_area(outer) - sum(ring_area(h) for h in poly[1:])
        total += deg2 * (111.32 * 111.32 * math.cos(math.radians(cy)))
    return max(total, 0.0)


# ---------------------------------------------------------------- WGMS mass balance


def parse_wgms_regions(csv_by_code: dict[str, str], years_back: int = 12) -> list[dict[str, Any]]:
    """Regional annual series from the amce zip (`region/<CODE>.csv`: year, area_km2, mwe, mwe_sigma, gt, gt_sigma)."""
    regions: list[dict[str, Any]] = []
    for code, text in csv_by_code.items():
        meta = WGMS_REGIONS.get(code)
        if not meta:
            continue
        rows = list(csv.DictReader(io.StringIO(text)))
        rows = [r for r in rows if r.get("year") and r.get("mwe") not in (None, "")]
        rows.sort(key=lambda r: int(r["year"]), reverse=True)
        for r in rows[:years_back]:
            rec: dict[str, Any] = {
                "region": meta[0],
                "regionName": meta[1],
                "year": int(r["year"]),
                "mwe": round(float(r["mwe"]), 3),
            }
            if r.get("gt") not in (None, ""):
                rec["gt"] = round(float(r["gt"]), 3)
            regions.append(rec)
    regions.sort(key=lambda r: (r["region"], -r["year"], r["regionName"]))
    return regions


def latest_mwe_by_region(regions: list[dict[str, Any]]) -> dict[str, float]:
    """Newest year per RGI region (region 17 has two WGMS sub-regions -> mean)."""
    by: dict[str, list[float]] = {}
    seen: set[tuple[str, str]] = set()
    for r in regions:  # already sorted newest first per region name
        key = (r["region"], r["regionName"])
        if key in seen:
            continue
        seen.add(key)
        by.setdefault(r["region"], []).append(r["mwe"])
    return {k: round(sum(v) / len(v), 3) for k, v in by.items()}


def _load_wgms(cfg: PipelineConfig, fetcher: Fetcher) -> dict[str, str]:
    if "wgms_regions_dir" in cfg.fixtures:
        d = Path(cfg.fixtures["wgms_regions_dir"])
        return {p.stem: p.read_text(encoding="utf-8") for p in d.glob("*.csv")}
    cache = cfg.out_dir / ".cache" / "glaciers"
    cache.mkdir(parents=True, exist_ok=True)
    zp = cache / Path(WGMS_AMCE_URL).name
    if not zp.exists():
        fetcher.download(WGMS_AMCE_URL, zp)
    out: dict[str, str] = {}
    with zipfile.ZipFile(zp) as z:
        for info in z.infolist():
            if info.filename.startswith("region/") and info.filename.endswith(".csv"):
                out[Path(info.filename).stem] = z.read(info).decode("utf-8")
    return out


# ---------------------------------------------------------------- outlines


def sample_outlines(ne_fc: dict[str, Any], mwe: dict[str, float]) -> dict[str, Any]:
    feats = []
    for i, f in enumerate(ne_fc.get("features", []), start=1):
        geom = f["geometry"]
        if geom["type"] not in ("Polygon", "MultiPolygon"):
            continue
        ring = geom["coordinates"][0] if geom["type"] == "Polygon" else geom["coordinates"][0][0]
        lon, lat = polygon_centroid(ring)
        region = region_for(lon, lat)
        props: dict[str, Any] = {
            "id": f"NE50-{i:04d}",
            "region": region,
            "areaKm2": round(_area_km2_approx(geom), 1),
        }
        if region in mwe:
            props["massBalanceMwe"] = mwe[region]
        feats.append(
            {
                "type": "Feature",
                "id": props["id"],
                "geometry": round_coords(geom, 3),
                "properties": props,
            }
        )
    return {"type": "FeatureCollection", "features": feats}


def run_full_outlines(
    cfg: PipelineConfig, fetcher: Fetcher, mwe: dict[str, float]
) -> tuple[Path | None, dict[str, Any]]:
    """Download the 19 RGI regional zips (Earthdata login) and build PMTiles + a > 5 km² GeoJSON."""
    from pyogrio import read_dataframe

    from pipelines.groundwater_grace.earthdata import earthdata_download

    if not (cfg.earthdata_username and cfg.earthdata_password):
        raise FetchError("RGI 7.0 at NSIDC requires Earthdata login (EARTHDATA_USERNAME/PASSWORD)")
    cache = cfg.out_dir / ".cache" / "glaciers"
    tmp = tmp_dir(cfg, "glaciers")
    seq = tmp / "glaciers.geojsonseq"
    big_features: list[dict[str, Any]] = []
    import json

    with seq.open("w", encoding="utf-8") as fh:
        for region, fname in RGI_REGION_FILES.items():
            zp = cache / fname
            if not zp.exists():
                earthdata_download(
                    RGI_NSIDC_BASE + fname, zp, cfg.earthdata_username, cfg.earthdata_password
                )
            with zipfile.ZipFile(zp) as z:
                shp = next(n for n in z.namelist() if n.endswith(".shp"))
                z.extractall(cache / fname[:-4])
            gdf = read_dataframe(
                cache / fname[:-4] / shp, columns=["rgi_id", "glac_name", "o1region", "area_km2"]
            )
            for row in gdf.itertuples(index=False):
                props: dict[str, Any] = {
                    "id": row.rgi_id,
                    "region": region,
                    "areaKm2": round(float(row.area_km2), 3),
                }
                if isinstance(row.glac_name, str) and row.glac_name:
                    props["name"] = row.glac_name
                if region in mwe:
                    props["massBalanceMwe"] = mwe[region]
                geom = row.geometry.__geo_interface__
                feat = {"type": "Feature", "id": props["id"], "geometry": geom, "properties": props}
                fh.write(json.dumps(feat, separators=(",", ":")) + "\n")
                if props["areaKm2"] >= 5:
                    big_features.append({**feat, "geometry": round_coords(geom, 3)})
    pm: Path | None = None
    try:
        pm = tippecanoe(
            [seq],
            tmp / "glaciers.pmtiles",
            layer="glaciers",
            minzoom=2,
            maxzoom=10,
            include=["id", "name", "region", "areaKm2", "massBalanceMwe"],
        )
    except TippecanoeMissingError:
        log.warning("tippecanoe missing: glacier PMTiles skipped")
    return pm, {"type": "FeatureCollection", "features": big_features}


def run(cfg: PipelineConfig) -> LayerManifest:
    layer = "glaciers"
    storage = Storage(cfg.out_dir, cfg.public_base_url, cfg.publish)
    tmp = tmp_dir(cfg, layer)
    artifacts: list[ArtifactRef] = []
    notes: list[str] = []
    with Fetcher(cache_dir=cfg.out_dir / ".cache", per_second=2, timeout=600) as fetcher:
        try:
            regions = parse_wgms_regions(_load_wgms(cfg, fetcher))
        except (FetchError, zipfile.BadZipFile, OSError) as exc:
            log.warning("WGMS unavailable: %s", exc)
            regions = []
            notes.append("glaciers.noMassBalance")
        mwe = latest_mwe_by_region(regions)
        if regions:
            mb = {
                "generatedAt": iso(cfg.now),
                "source": "WGMS annual mass-change estimates 2026-02-10",
                "sourceUrl": WGMS_DOI,
                "regions": regions,
            }
            validate("mass-balance", mb)
            p = write_json(tmp / "massbalance.json", mb)
            st = storage.put(p, layer, cfg.version, "massbalance.json", cache_seconds=86400)
            artifacts.append(
                ArtifactRef(kind="json", url=st.url, bytes=st.bytes, name="massbalance")
            )

        pm: Path | None = None
        has_earthdata = bool(cfg.earthdata_username and cfg.earthdata_password)
        if cfg.sample or "ne_glaciers" in cfg.fixtures or not has_earthdata:
            if not (cfg.sample or "ne_glaciers" in cfg.fixtures):
                # RGI 7 lives behind an Earthdata login (docs/DEVIATIONS.md). Ship real WGMS mass
                # balance on Natural Earth outlines rather than dropping the layer (spec §2.1).
                log.warning("no Earthdata login: publishing Natural Earth glacier outlines")
                notes.append("glaciers.noEarthdata")
            ne = load_fixture_or(cfg, "ne_glaciers", lambda: fetcher.get_json(NE_GLACIERS_URL))
            fc = sample_outlines(ne, mwe)
            attribution = SAMPLE_ATTRIBUTION
            notes.append("glaciers.sampleGeometry")
        else:
            pm, fc = run_full_outlines(cfg, fetcher, mwe)
            attribution = ATTRIBUTION
    validate("glacier-collection", fc)
    p = write_json(tmp / "glaciers.geojson", fc)
    st = storage.put(p, layer, cfg.version, "glaciers.geojson", cache_seconds=86400)
    artifacts.append(ArtifactRef(kind="geojson", url=st.url, bytes=st.bytes, name="outlines"))
    if pm is not None:
        st = storage.put(pm, layer, cfg.version, "glaciers.pmtiles", cache_seconds=86400)
        artifacts.append(ArtifactRef(kind="pmtiles", url=st.url, bytes=st.bytes, name="tiles"))
    newest_year = max((r["year"] for r in regions), default=None)
    return LayerManifest(
        id=layer,
        version=cfg.version,
        generatedAt=iso(cfg.now),
        sourceUpdatedAt=f"{newest_year}-12-31T00:00:00Z" if newest_year else iso(cfg.now),
        stale=False,
        artifacts=artifacts,
        attribution=attribution,
        coverage="global",
        legend={
            "unit": "m w.e./yr",
            "stops": [
                {"value": -2, "color": "#C8873A", "label": "−2"},
                {"value": -1, "color": "#CFE6F0", "label": "−1"},
                {"value": 0, "color": "#EAF4F8", "label": "0"},
            ],
        },
        sample=cfg.sample,
        versions=versions_with(cfg),
        notes=notes,
    )
