"""Copernicus Global Drought Observatory (GDO) -> drought raster overlays.

Products
  cdi   Combined Drought Indicator v4.1 (WMS layer `cdiad`, 10-daily) — classes watch/warning/alert
  spi3  SPI-3 (WMS layer `spgTS`, monthly) — best effort; the WMS rejected every GetMap variant
        we tried on 2026-09-02, so the pipeline records `drought.noSpi` when it fails.

The WMS renders in the source palette; we request EPSG:3857 and remap palette colours onto
design tokens (spec §6.4) at ingest, then slice into PNG tiles and package as PMTiles.
"""

from __future__ import annotations

import io
import logging
import re
from datetime import UTC, datetime
from typing import Any

from PIL import Image

from common.config import PipelineConfig, iso
from common.fetch import Fetcher, FetchError
from common.manifest import ArtifactRef, LayerManifest
from common.pipeline import tmp_dir, versions_with
from common.pmtiles_writer import write_pmtiles
from common.raster import MAX_LAT, image_to_tiles, recolor
from common.storage import Storage

log = logging.getLogger(__name__)

WMS = "https://drought.emergency.copernicus.eu/api/wms"
WORLD_3857 = "-20037508.34,-20037508.34,20037508.34,20037508.34"
CDI_LAYER = "cdiad"
SPI_LAYER = "spgTS"
IMAGE_SIZE = 4096
TILE_MAXZOOM = 5

# GDO CDI palette (verified from GetMap output 2026-09-02) -> token RGBA
CDI_COLORS: dict[tuple[int, int, int], tuple[int, int, int, int]] = {
    (240, 228, 66): (0xD9, 0xA4, 0x5B, 200),  # watch
    (230, 159, 0): (0xC8, 0x87, 0x3A, 220),  # warning
    (220, 5, 12): (0x7A, 0x4A, 0x1C, 240),  # alert
    (244, 236, 128): (0xD9, 0xA4, 0x5B, 110),  # partial / temporary recovery variants
    (238, 190, 83): (0xC8, 0x87, 0x3A, 120),
    (231, 87, 91): (0x7A, 0x4A, 0x1C, 130),
}

ATTRIBUTION = {
    "name": "Copernicus Emergency Management Service — Global Drought Observatory (European Commission, JRC)",
    "url": "https://drought.emergency.copernicus.eu",
    "license": "Copernicus data: free, full and open access with attribution",
}


def latest_time(capabilities_xml: str, layer: str) -> str | None:
    """End of the layer's TIME extent, e.g. '2026-06-11' for '2012-01-01/2026-06-11/P10D'."""
    m = re.search(rf"<Name>{layer}</Name>(.*?)</Layer>", capabilities_xml, re.S)
    if not m:
        return None
    ext = re.search(r'<Extent name="time"[^>]*>([^<]+)</Extent>', m.group(1), re.S)
    if not ext:
        return None
    parts = ext.group(1).strip().split("/")
    return parts[1] if len(parts) >= 2 else parts[0]


def getmap_params(layer: str, time: str | None, size: int = IMAGE_SIZE) -> dict[str, Any]:
    p: dict[str, Any] = {
        "SERVICE": "WMS",
        "VERSION": "1.1.1",
        "REQUEST": "GetMap",
        "LAYERS": layer,
        "STYLES": "",
        "SRS": "EPSG:3857",
        "BBOX": WORLD_3857,
        "WIDTH": size,
        "HEIGHT": size,
        "FORMAT": "image/png",
        "TRANSPARENT": "true",
    }
    if time:
        p["TIME"] = time
    return p


def recolor_cdi(img: Image.Image) -> Image.Image:
    return recolor(img, CDI_COLORS, tolerance=10)


def _publish_image(
    storage: Storage, cfg: PipelineConfig, img: Image.Image, name: str, tmp: Any
) -> list[ArtifactRef]:
    layer = "drought"
    refs: list[ArtifactRef] = []
    # 2048 px world image for the MapLibre image source (offline + low zoom)
    small = img.resize((2048, 2048), Image.Resampling.NEAREST)
    png_path = tmp / f"{name}.png"
    small.save(png_path, optimize=True)
    st = storage.put(png_path, layer, cfg.version, f"{name}.png", cache_seconds=3600)
    refs.append(
        ArtifactRef(
            kind="png",
            url=st.url,
            bytes=st.bytes,
            name=name,
            bbox=[-180.0, -MAX_LAT, 180.0, MAX_LAT],
        )
    )
    tiles = image_to_tiles(img, 0, TILE_MAXZOOM)
    if tiles:
        pm_path = tmp / f"{name}.pmtiles"
        write_pmtiles(
            tiles,
            pm_path,
            tile_type="png",
            metadata={"name": name, "attribution": ATTRIBUTION["name"]},
        )
        st = storage.put(pm_path, layer, cfg.version, f"{name}.pmtiles", cache_seconds=3600)
        refs.append(
            ArtifactRef(kind="raster-pmtiles", url=st.url, bytes=st.bytes, name=f"{name}-tiles")
        )
    return refs


def run(cfg: PipelineConfig) -> LayerManifest:
    layer = "drought"
    storage = Storage(cfg.out_dir, cfg.public_base_url, cfg.publish)
    tmp = tmp_dir(cfg, layer)
    artifacts: list[ArtifactRef] = []
    notes: list[str] = []
    cdi_time: str | None = None
    with Fetcher(cache_dir=cfg.out_dir / ".cache", per_second=1, timeout=180) as fetcher:
        # ---- CDI
        if "gdo_cdi_png" in cfg.fixtures:
            cdi_img = Image.open(cfg.fixtures["gdo_cdi_png"]).convert("RGBA")
            cdi_time = (
                cfg.fixtures.get("gdo_time")
                and cfg.fixtures["gdo_time"].read_text(encoding="utf-8").strip()
            ) or None
        else:
            caps = fetcher.get_text(
                WMS, params={"REQUEST": "GetCapabilities", "SERVICE": "WMS", "VERSION": "1.1.1"}
            )
            cdi_time = latest_time(caps, CDI_LAYER)
            png = fetcher.get_bytes(WMS, params=getmap_params(CDI_LAYER, cdi_time), use_cache=False)
            cdi_img = Image.open(io.BytesIO(png)).convert("RGBA")
        cdi = recolor_cdi(cdi_img)
        artifacts += _publish_image(storage, cfg, cdi, "cdi", tmp)

        # ---- SPI-3 (best effort)
        spi_ok = False
        if "gdo_cdi_png" not in cfg.fixtures:
            try:
                caps_spi_time = latest_time(caps, SPI_LAYER)  # type: ignore[possibly-undefined]
                png = fetcher.get_bytes(
                    WMS, params=getmap_params(SPI_LAYER, caps_spi_time), use_cache=False
                )
                spi_img = Image.open(io.BytesIO(png)).convert("RGBA")
                artifacts += _publish_image(storage, cfg, spi_img, "spi3", tmp)
                spi_ok = True
            except (FetchError, OSError) as exc:
                log.warning("SPI-3 GetMap failed: %s", exc)
        if not spi_ok:
            notes.append("drought.noSpi")

    observed = datetime.fromisoformat(cdi_time).replace(tzinfo=UTC) if cdi_time else cfg.now
    return LayerManifest(
        id=layer,
        version=cfg.version,
        generatedAt=iso(cfg.now),
        sourceUpdatedAt=iso(observed),
        stale=False,
        artifacts=artifacts,
        attribution=ATTRIBUTION,
        coverage="global",
        legend={
            "unit": "class",
            "stops": [
                {"value": 0, "color": "transparent", "label": "none"},
                {"value": 1, "color": "#D9A45B", "label": "watch"},
                {"value": 2, "color": "#C8873A", "label": "warning"},
                {"value": 3, "color": "#7A4A1C", "label": "alert"},
            ],
        },
        sample=cfg.sample,
        versions=versions_with(cfg),
        notes=notes,
    )
