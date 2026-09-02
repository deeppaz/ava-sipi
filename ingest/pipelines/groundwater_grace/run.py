"""GRACE / GRACE-FO groundwater & total water storage -> groundwater raster tiles + cell series.

Primary (Earthdata login): JPL Mascon RL06.3 CRI v4 monthly `lwe_thickness` (cm w.e., 0.5°,
2002-04 →). One PMTiles per month for the time slider, a latest image, a 24-month mean + trend
raster, and 1° cell series stored in 5° blocks.

Fallback (no login): NASA GRACE-DA global groundwater-storage percentile (UNL, weekly, 0.25°,
open HTTP). Unit `percentile`; no history. The manifest notes `groundwater.percentileFallback`.
"""

from __future__ import annotations

import io
import logging
import re
from datetime import UTC, datetime, timedelta
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from common.colors import GROUNDWATER_RAMP, PERCENTILE_RAMP
from common.config import PipelineConfig, iso
from common.fetch import Fetcher, FetchError
from common.manifest import ArtifactRef, LayerManifest
from common.pipeline import tmp_dir, versions_with, write_json
from common.pmtiles_writer import write_pmtiles
from common.raster import MAX_LAT, Grid, grid_to_image, grid_to_tiles, lut_from_ramp
from common.storage import Storage
from common.validate import validate

log = logging.getLogger(__name__)

UNL_BASE = "https://nasagrace.unl.edu/globaldata/"
UNL_FILE = "gws_perc_025deg_GL.tif"
CMR_URL = "https://cmr.earthdata.nasa.gov/search/granules.json"
MASCON_SHORT_NAME = "TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4"
TILE_MAXZOOM = 4
SERIES_BLOCK_DEG = 5

ATTRIBUTION = {
    "name": "NASA JPL GRACE/GRACE-FO Mascon RL06.3 (Watkins et al. 2015; Wiese et al. 2016) · NASA GRACE-DA groundwater indicators (GSFC / NDMC, UNL)",
    "url": "https://podaac.jpl.nasa.gov/dataset/TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4",
    "license": "NASA open data (free with citation)",
}

CM_LEGEND = {
    "unit": "cm",
    "stops": [
        {"value": -20, "color": "#7A4A1C", "label": "−20"},
        {"value": -10, "color": "#C8873A", "label": "−10"},
        {"value": 0, "color": "transparent", "label": "0"},
        {"value": 10, "color": "#7FB8D6", "label": "+10"},
        {"value": 20, "color": "#35E0E0", "label": "+20"},
    ],
}
PERCENTILE_LEGEND = {
    "unit": "percentile",
    "stops": [
        {"value": 0, "color": "#7A4A1C", "label": "0"},
        {"value": 20, "color": "#C8873A", "label": "20"},
        {"value": 50, "color": "transparent", "label": "50"},
        {"value": 80, "color": "#7FB8D6", "label": "80"},
        {"value": 100, "color": "#35E0E0", "label": "100"},
    ],
}


# ------------------------------------------------------------------ UNL fallback


def unl_recent_folders(listing_html: str, n: int = 6) -> list[str]:
    """Dated folders newest first (YYYYMMDD)."""
    dates = sorted(set(re.findall(r"(20\d{6})/", listing_html)), reverse=True)
    return dates[:n]


def unl_latest_folder(listing_html: str) -> str | None:
    folders = unl_recent_folders(listing_html, 1)
    return folders[0] if folders else None


def grid_from_unl_tif(data: bytes) -> Grid:
    """UNL GeoTIFF: float32 1440×600, lon −180…180, lat 90…−60, nodata −999 (no world file served)."""
    im = Image.open(io.BytesIO(data))
    arr = np.asarray(im, dtype=np.float32)
    rows, cols = arr.shape
    dlon = 360.0 / cols
    dlat = 150.0 / rows if rows == 600 else 180.0 / rows
    return Grid(values=arr, lon0=-180.0, lat0=90.0, dlon=dlon, dlat=dlat, nodata=-999.0)


def publish_grid(
    storage: Storage,
    cfg: PipelineConfig,
    grid: Grid,
    ramp: Any,
    vmin: float,
    vmax: float,
    name: str,
    tmp: Path,
) -> list[ArtifactRef]:
    layer = "groundwater"
    lut = lut_from_ramp(ramp.rgba, vmin, vmax)
    refs: list[ArtifactRef] = []
    png, bbox = grid_to_image(grid, lut, width=2048)
    png_path = tmp / f"{name}.png"
    png_path.write_bytes(png)
    st = storage.put(png_path, layer, cfg.version, f"{name}.png", cache_seconds=3600)
    refs.append(ArtifactRef(kind="png", url=st.url, bytes=st.bytes, name=name, bbox=bbox))
    tiles = grid_to_tiles(grid, lut, 0, TILE_MAXZOOM)
    if tiles:
        pm = tmp / f"{name}.pmtiles"
        write_pmtiles(
            tiles, pm, tile_type="png", metadata={"name": name, "attribution": ATTRIBUTION["name"]}
        )
        st = storage.put(pm, layer, cfg.version, f"{name}.pmtiles", cache_seconds=3600)
        refs.append(
            ArtifactRef(kind="raster-pmtiles", url=st.url, bytes=st.bytes, name=f"{name}-tiles")
        )
    return refs


def run_fallback(
    cfg: PipelineConfig, storage: Storage, tmp: Path
) -> tuple[list[ArtifactRef], datetime]:
    with Fetcher(cache_dir=cfg.out_dir / ".cache", per_second=1, timeout=300) as fetcher:
        if "unl_tif" in cfg.fixtures:
            data = Path(cfg.fixtures["unl_tif"]).read_bytes()
            observed = cfg.now
        else:
            # `current/` always holds the newest published GeoTIFFs (dated folders often lack them);
            # its date comes from Last-Modified, with the listing's dated folders as fallback.
            current_url = f"{UNL_BASE}current/{UNL_FILE}"
            data = b""
            observed = cfg.now
            try:
                data = fetcher.get_bytes(current_url, use_cache=False)
                lm = fetcher.last_modified(current_url)
                if lm:
                    observed = parsedate_to_datetime(lm).astimezone(UTC)
            except FetchError as exc:
                log.warning("UNL current/ unavailable (%s); trying dated folders", exc)
                listing = fetcher.get_text(UNL_BASE, use_cache=False)
                last_exc: Exception | None = exc
                for folder in unl_recent_folders(listing):
                    try:
                        data = fetcher.get_bytes(f"{UNL_BASE}{folder}/{UNL_FILE}")
                        observed = datetime.strptime(folder, "%Y%m%d").replace(tzinfo=UTC)
                        break
                    except FetchError as exc2:
                        last_exc = exc2
                if not data:
                    raise FetchError(f"no UNL GeoTIFF available: {last_exc}") from last_exc
    grid = grid_from_unl_tif(data)
    refs = publish_grid(storage, cfg, grid, PERCENTILE_RAMP, 0, 100, "gws_percentile", tmp)
    return refs, observed


# ------------------------------------------------------------------ JPL mascon primary


def _latest_mascon_url(fetcher: Fetcher) -> tuple[str, str]:
    data = fetcher.get_json(
        CMR_URL,
        params={"short_name": MASCON_SHORT_NAME, "sort_key": "-start_date", "page_size": 1},
        use_cache=False,
    )
    entry = data["feed"]["entry"][0]
    href = next(
        link["href"]
        for link in entry["links"]
        if link.get("href", "").endswith(".nc") and "archive" in link["href"]
    )
    return href, entry["title"]


def _month_grids(nc_path: Path) -> list[tuple[str, Grid]]:
    """Every monthly lwe_thickness field scaled by the CRI scale factor, land only."""
    import netCDF4  # geo extra

    ds = netCDF4.Dataset(nc_path)
    lwe = ds.variables["lwe_thickness"]
    lat = ds.variables["lat"][:]
    lon = ds.variables["lon"][:]
    scale = ds.variables["scale_factor"][:] if "scale_factor" in ds.variables else 1.0
    land = ds.variables["land_mask"][:] if "land_mask" in ds.variables else None
    times = ds.variables["time"]
    units = getattr(times, "units", "days since 2002-01-01T00:00:00Z")
    base = datetime.fromisoformat(
        units.split("since")[1].strip().replace("Z", "+00:00").replace(" ", "T")
    )
    out: list[tuple[str, Grid]] = []
    dlat = float(abs(lat[1] - lat[0]))
    dlon = float(abs(lon[1] - lon[0]))
    north_first = lat[0] > lat[-1]
    for i in range(len(times)):
        day = base + timedelta(days=float(times[i]))
        arr = np.array(lwe[i, :, :], dtype=np.float32) * np.array(scale, dtype=np.float32)
        if land is not None:
            arr = np.where(np.array(land) > 0, arr, np.nan)
        if not north_first:
            arr = arr[::-1, :]
        # longitudes 0..360 -> -180..180
        if float(lon.min()) >= 0:
            half = arr.shape[1] // 2
            arr = np.concatenate([arr[:, half:], arr[:, :half]], axis=1)
        out.append(
            (
                day.strftime("%Y-%m"),
                Grid(values=arr, lon0=-180.0, lat0=90.0, dlon=dlon, dlat=dlat, nodata=None),
            )
        )
    ds.close()
    return out


def _series_blocks(months: list[tuple[str, Grid]]) -> dict[str, dict[str, list[list[Any]]]]:
    """1° cell means aggregated into 5°×5° block documents: {block: {cell: [[day, cm], ...]}}."""
    blocks: dict[str, dict[str, list[list[Any]]]] = {}
    for month, grid in months:
        vals = grid.values
        step = int(round(1.0 / grid.dlat))
        rows, cols = vals.shape
        for r in range(0, rows - step + 1, step):
            lat_top = grid.lat0 - r * grid.dlat
            for c in range(0, cols - step + 1, step):
                cell = vals[r : r + step, c : c + step]
                if np.all(np.isnan(cell)):
                    continue
                v = float(np.nanmean(cell))
                lon_w = grid.lon0 + c * grid.dlon
                lat_s = lat_top - 1.0
                block = f"b{int(np.floor(lat_s / SERIES_BLOCK_DEG) * SERIES_BLOCK_DEG)}_{int(np.floor(lon_w / SERIES_BLOCK_DEG) * SERIES_BLOCK_DEG)}"
                cell_id = f"{int(round(lat_s))}_{int(round(lon_w))}"
                blocks.setdefault(block, {}).setdefault(cell_id, []).append(
                    [f"{month}-01", round(v, 2)]
                )
    return blocks


def trend_grid(months: list[tuple[str, Grid]], years: int = 10) -> tuple[Grid, Grid]:
    """(24-month mean, linear trend cm/yr over the last `years`)."""
    recent = months[-24:]
    mean = np.nanmean(np.stack([g.values for _, g in recent]), axis=0)
    window = months[-12 * years :]
    t = np.array([i / 12.0 for i in range(len(window))])
    stack = np.stack([g.values for _, g in window])
    tm = t - t.mean()
    ym = stack - np.nanmean(stack, axis=0)
    slope = np.nansum(tm[:, None, None] * ym, axis=0) / np.sum(tm * tm)
    g0 = months[-1][1]
    return (
        Grid(
            values=mean.astype(np.float32), lon0=g0.lon0, lat0=g0.lat0, dlon=g0.dlon, dlat=g0.dlat
        ),
        Grid(
            values=slope.astype(np.float32), lon0=g0.lon0, lat0=g0.lat0, dlon=g0.dlon, dlat=g0.dlat
        ),
    )


def run_primary(
    cfg: PipelineConfig, storage: Storage, tmp: Path
) -> tuple[list[ArtifactRef], datetime]:
    from .earthdata import earthdata_download

    layer = "groundwater"
    assert cfg.earthdata_username and cfg.earthdata_password
    cache = cfg.out_dir / ".cache" / "groundwater"
    with Fetcher(cache_dir=cache, per_second=1, timeout=120) as fetcher:
        url, title = _latest_mascon_url(fetcher)
    nc = cache / Path(url).name
    if not nc.exists():
        earthdata_download(url, nc, cfg.earthdata_username, cfg.earthdata_password)
    months = _month_grids(nc)
    log.info("mascon %s: %d months", title, len(months))
    lut = lut_from_ramp(GROUNDWATER_RAMP.rgba, -20, 20)
    refs: list[ArtifactRef] = []
    # per-month tiles (time slider), skipping months already published in a previous version
    existing = (
        {p.name for p in (cfg.out_dir / layer / "latest").glob("tws_*.pmtiles")}
        if (cfg.out_dir / layer / "latest").exists()
        else set()
    )
    for month, grid in months:
        name = f"tws_{month.replace('-', '')}.pmtiles"
        if name in existing and month != months[-1][0]:
            refs.append(
                ArtifactRef(
                    kind="raster-pmtiles",
                    url=storage.url_for(f"{layer}/latest/{name}"),
                    bytes=(cfg.out_dir / layer / "latest" / name).stat().st_size,
                    name=f"tws-{month}",
                )
            )
            continue
        tiles = grid_to_tiles(grid, lut, 0, TILE_MAXZOOM)
        pm = tmp / name
        write_pmtiles(tiles, pm, tile_type="png", metadata={"name": name, "month": month})
        st = storage.put(pm, layer, cfg.version, name, cache_seconds=86400 * 30)
        refs.append(
            ArtifactRef(kind="raster-pmtiles", url=st.url, bytes=st.bytes, name=f"tws-{month}")
        )
    latest_month, latest_grid = months[-1]
    refs += publish_grid(storage, cfg, latest_grid, GROUNDWATER_RAMP, -20, 20, "tws_latest", tmp)
    mean24, slope = trend_grid(months)
    refs += publish_grid(storage, cfg, mean24, GROUNDWATER_RAMP, -20, 20, "tws_mean24", tmp)
    refs += publish_grid(storage, cfg, slope, GROUNDWATER_RAMP, -3, 3, "tws_trend", tmp)
    for block, cells in _series_blocks(months).items():
        doc = {"block": block, "unit": "cm", "cells": cells}
        for cell_id, pts in list(cells.items())[:1]:
            validate("groundwater-cell-series", {"cell": cell_id, "unit": "cm", "points": pts})
        p = write_json(tmp / "series" / f"{block}.json", doc)
        st = storage.put(p, layer, cfg.version, f"series/{block}.json", cache_seconds=86400 * 30)
    refs.append(
        ArtifactRef(
            kind="json",
            url=storage.url_for(f"{layer}/{cfg.version}/series/"),
            bytes=0,
            name="series-blocks",
        )
    )
    observed = datetime.strptime(latest_month, "%Y-%m").replace(tzinfo=UTC)
    return refs, observed


def run(cfg: PipelineConfig) -> LayerManifest:
    layer = "groundwater"
    storage = Storage(cfg.out_dir, cfg.public_base_url, cfg.publish)
    tmp = tmp_dir(cfg, layer)
    notes: list[str] = []
    legend = CM_LEGEND
    artifacts: list[ArtifactRef] = []
    observed = cfg.now
    use_primary = (
        bool(cfg.earthdata_username and cfg.earthdata_password) and "unl_tif" not in cfg.fixtures
    )
    if use_primary:
        try:
            artifacts, observed = run_primary(cfg, storage, tmp)
        except Exception as exc:
            log.warning("mascon pipeline failed (%s); using GRACE-DA percentile fallback", exc)
            use_primary = False
    if not use_primary:
        artifacts, observed = run_fallback(cfg, storage, tmp)
        legend = PERCENTILE_LEGEND
        notes.append("groundwater.percentileFallback")
    return LayerManifest(
        id=layer,
        version=cfg.version,
        generatedAt=iso(cfg.now),
        sourceUpdatedAt=iso(observed),
        stale=not use_primary and not cfg.sample,
        artifacts=artifacts,
        attribution=ATTRIBUTION,
        coverage="global",
        bbox=[-180.0, -MAX_LAT, 180.0, MAX_LAT],
        legend=legend,
        sample=cfg.sample,
        versions=versions_with(cfg),
        notes=notes,
    )
