"""Raster helpers: regular lon/lat grids -> Web-Mercator PNG tiles, and Mercator images -> tiles.

numpy-vectorised so a global 0.25° grid tiles to z5 in seconds.
"""

from __future__ import annotations

import io
import math
from collections.abc import Callable
from dataclasses import dataclass

import numpy as np
from PIL import Image

MAX_LAT = 85.05112878
TILE = 256


@dataclass(slots=True)
class Grid:
    """Regular lon/lat grid. Row 0 is the northernmost row (lat0 = top edge)."""

    values: np.ndarray  # 2D float array
    lon0: float  # west edge
    lat0: float  # north edge
    dlon: float  # positive
    dlat: float  # positive (rows go south)
    nodata: float | None = None

    @property
    def rows(self) -> int:
        return int(self.values.shape[0])

    @property
    def cols(self) -> int:
        return int(self.values.shape[1])

    def sample(self, lon: np.ndarray, lat: np.ndarray, bilinear: bool = True) -> np.ndarray:
        """Sample the grid at lon/lat arrays; returns NaN outside / at nodata."""
        lon = ((lon + 180.0) % 360.0) - 180.0
        fx = (lon - self.lon0) / self.dlon - 0.5
        fy = (self.lat0 - lat) / self.dlat - 0.5
        vals = self.values.astype(np.float64)
        if self.nodata is not None:
            vals = np.where(vals == self.nodata, np.nan, vals)
        if not bilinear:
            ix = np.clip(np.round(fx).astype(int), 0, self.cols - 1)
            iy = np.clip(np.round(fy).astype(int), 0, self.rows - 1)
            out = vals[iy, ix]
        else:
            x0 = np.floor(fx).astype(int)
            y0 = np.floor(fy).astype(int)
            tx = fx - x0
            ty = fy - y0
            x0c = np.clip(x0, 0, self.cols - 1)
            x1c = np.clip(x0 + 1, 0, self.cols - 1)
            y0c = np.clip(y0, 0, self.rows - 1)
            y1c = np.clip(y0 + 1, 0, self.rows - 1)
            v00, v10 = vals[y0c, x0c], vals[y0c, x1c]
            v01, v11 = vals[y1c, x0c], vals[y1c, x1c]
            # nan-aware weights: ignore missing neighbours
            stack = np.stack([v00, v10, v01, v11])
            w = np.stack([(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty])
            valid = ~np.isnan(stack)
            wsum = np.where(valid, w, 0).sum(axis=0)
            out = np.where(
                wsum > 0,
                np.nansum(np.where(valid, stack * w, 0), axis=0) / np.where(wsum > 0, wsum, 1),
                np.nan,
            )
        outside = (fy < -0.5) | (fy > self.rows - 0.5)
        return np.where(outside, np.nan, out)

    def value_at(self, lon: float, lat: float) -> float | None:
        v = float(self.sample(np.array([lon]), np.array([lat]), bilinear=False)[0])
        return None if math.isnan(v) else v


def tile_lonlat(z: int, x: int, y: int, size: int = TILE) -> tuple[np.ndarray, np.ndarray]:
    """Pixel-centre lon/lat arrays (size×size) for a Web-Mercator tile."""
    n = 2**z * size
    px = x * size + np.arange(size) + 0.5
    py = y * size + np.arange(size) + 0.5
    lon = px / n * 360.0 - 180.0
    lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * py / n))))
    return np.broadcast_to(lon[None, :], (size, size)), np.broadcast_to(lat[:, None], (size, size))


ColorLut = Callable[[np.ndarray], np.ndarray]  # values -> (…,4) uint8


def lut_from_ramp(
    rgba: Callable[[float], tuple[int, int, int, int]], vmin: float, vmax: float, steps: int = 512
) -> ColorLut:
    table = np.array(
        [rgba(vmin + (vmax - vmin) * i / (steps - 1)) for i in range(steps)], dtype=np.uint8
    )

    def apply(v: np.ndarray) -> np.ndarray:
        idx = np.clip(((v - vmin) / (vmax - vmin) * (steps - 1)), 0, steps - 1)
        out = table[np.nan_to_num(idx, nan=0).astype(int)]
        out = out.copy()
        out[np.isnan(v)] = (0, 0, 0, 0)
        return out

    return apply


def png_bytes(rgba: np.ndarray) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(rgba.astype(np.uint8), "RGBA").save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def grid_to_tiles(
    grid: Grid,
    lut: ColorLut,
    minzoom: int,
    maxzoom: int,
    bilinear: bool = True,
    size: int = TILE,
) -> dict[tuple[int, int, int], bytes]:
    """Render every tile that contains data."""
    tiles: dict[tuple[int, int, int], bytes] = {}
    for z in range(minzoom, maxzoom + 1):
        n = 2**z
        for x in range(n):
            for y in range(n):
                lon, lat = tile_lonlat(z, x, y, size)
                v = grid.sample(lon, lat, bilinear=bilinear)
                if np.all(np.isnan(v)):
                    continue
                tiles[(z, x, y)] = png_bytes(lut(v))
    return tiles


def grid_to_image(
    grid: Grid, lut: ColorLut, width: int = 2048, bilinear: bool = True
) -> tuple[bytes, list[float]]:
    """Single Web-Mercator PNG spanning the whole world (±85.05°); returns (png, bbox)."""
    px = np.arange(width) + 0.5
    lon = px / width * 360.0 - 180.0
    lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * px / width))))
    lon2 = np.broadcast_to(lon[None, :], (width, width))
    lat2 = np.broadcast_to(lat[:, None], (width, width))
    v = grid.sample(lon2, lat2, bilinear=bilinear)
    return png_bytes(lut(v)), [-180.0, -MAX_LAT, 180.0, MAX_LAT]


def image_to_tiles(
    img: Image.Image, minzoom: int, maxzoom: int, size: int = TILE
) -> dict[tuple[int, int, int], bytes]:
    """Slice a square world image in EPSG:3857 (±85.05°) into z/x/y tiles."""
    tiles: dict[tuple[int, int, int], bytes] = {}
    img = img.convert("RGBA")
    for z in range(minzoom, maxzoom + 1):
        n = 2**z
        world = (
            img
            if img.width == n * size
            else img.resize((n * size, n * size), Image.Resampling.LANCZOS)
        )
        arr = np.asarray(world)
        for x in range(n):
            for y in range(n):
                tile = arr[y * size : (y + 1) * size, x * size : (x + 1) * size]
                if tile[..., 3].max() == 0:
                    continue
                tiles[(z, x, y)] = png_bytes(tile)
    return tiles


def recolor(
    img: Image.Image,
    mapping: dict[tuple[int, int, int], tuple[int, int, int, int]],
    tolerance: int = 12,
) -> Image.Image:
    """Map a palette-rendered image (e.g. WMS output) onto design-token colours.

    Pixels whose RGB is within `tolerance` (Chebyshev) of a key take the mapped RGBA;
    everything else becomes transparent.
    """
    arr = np.asarray(img.convert("RGBA")).astype(int)
    out = np.zeros_like(arr, dtype=np.uint8)
    rgb = arr[..., :3]
    for src, dst in mapping.items():
        mask = (np.abs(rgb - np.array(src)).max(axis=-1) <= tolerance) & (arr[..., 3] > 0)
        out[mask] = dst
    return Image.fromarray(out, "RGBA")
