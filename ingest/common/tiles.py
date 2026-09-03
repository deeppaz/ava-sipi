"""Tiling helpers: tippecanoe wrapper (vector PMTiles) and raster -> PNG tiles -> PMTiles.

tippecanoe is only available on Linux/macOS CI. The wrapper raises a clear error locally so a
pipeline can fall back to plain GeoJSON in sample mode.
"""

from __future__ import annotations

import logging
import math
import os
import shutil
import subprocess
from collections.abc import Callable, Sequence
from pathlib import Path

log = logging.getLogger(__name__)


class TippecanoeMissingError(RuntimeError):
    pass


def has_tippecanoe() -> bool:
    return shutil.which("tippecanoe") is not None


def tippecanoe_image() -> str | None:
    """Container image to tile with when there is no native binary (see infra/tippecanoe.Dockerfile)."""
    image = os.environ.get("TIPPECANOE_DOCKER_IMAGE")
    return image if image and shutil.which("docker") else None


def can_tile() -> bool:
    return has_tippecanoe() or tippecanoe_image() is not None


def _containerise(args: list[str], root: Path, image: str) -> list[str]:
    """Rewrite host paths under `root` to their bind-mounted counterparts."""
    mapped = []
    for arg in args:
        candidate = Path(arg)
        try:
            if (candidate.is_absolute() and candidate.exists()) or candidate.parent == root:
                mapped.append(f"/work/{candidate.relative_to(root).as_posix()}")
                continue
        except ValueError:
            pass
        mapped.append(arg)
    return ["docker", "run", "--rm", "-v", f"{root.as_posix()}:/work", image, *mapped]


def tippecanoe(
    inputs: Sequence[Path],
    out: Path,
    layer: str,
    minzoom: int,
    maxzoom: int,
    include: Sequence[str] = (),
    extra: Sequence[str] = (),
) -> Path:
    """Build a vector PMTiles file. `include` keeps only the listed attributes (`-y`)."""
    image = tippecanoe_image()
    if not has_tippecanoe() and not image:
        raise TippecanoeMissingError(
            "tippecanoe not found on PATH and TIPPECANOE_DOCKER_IMAGE unset"
        )
    out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "tippecanoe",
        "-o",
        str(out),
        "--force",
        "-l",
        layer,
        f"--minimum-zoom={minzoom}",
        f"--maximum-zoom={maxzoom}",
        "--drop-densest-as-needed",
        "--extend-zooms-if-still-dropping",
        "--simplify-only-low-zooms",
        "--no-tile-size-limit",
        "--read-parallel",
    ]
    for attr in include:
        cmd += ["-y", attr]
    cmd += list(extra)
    cmd += [str(p) for p in inputs]
    if image:
        cmd = _containerise(cmd, out.parent.resolve(), image)
    log.info("running %s", " ".join(cmd))
    subprocess.run(cmd, check=True)
    return out


# --- raster -> PNG tiles ---------------------------------------------------------------


def lonlat_to_pixel(lon: float, lat: float, z: int, tile_size: int = 256) -> tuple[float, float]:
    n = 2**z * tile_size
    x = (lon + 180.0) / 360.0 * n
    lat = max(min(lat, 85.05112878), -85.05112878)
    y = (
        (1.0 - math.log(math.tan(math.radians(lat)) + 1.0 / math.cos(math.radians(lat))) / math.pi)
        / 2.0
        * n
    )
    return x, y


def pixel_to_lonlat(px: float, py: float, z: int, tile_size: int = 256) -> tuple[float, float]:
    n = 2**z * tile_size
    lon = px / n * 360.0 - 180.0
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * py / n))))
    return lon, lat


ColorFn = Callable[[float], tuple[int, int, int, int]]


def render_tiles(
    sample: Callable[[float, float], float | None],
    color: ColorFn,
    out_dir: Path,
    minzoom: int,
    maxzoom: int,
    tile_size: int = 256,
    bbox: Sequence[float] = (-180, -85.05, 180, 85.05),
) -> list[Path]:
    """Render Web-Mercator PNG tiles by sampling `sample(lon, lat)` per pixel.

    Simple and dependency-light (Pillow + numpy); fine for z0-z6 global rasters.
    """
    import numpy as np
    from PIL import Image

    written: list[Path] = []
    for z in range(minzoom, maxzoom + 1):
        x0, y1 = lonlat_to_pixel(bbox[0], bbox[1], z, tile_size)
        x1, y0 = lonlat_to_pixel(bbox[2], bbox[3], z, tile_size)
        tx0, tx1 = int(x0 // tile_size), int(math.ceil(x1 / tile_size)) - 1
        ty0, ty1 = int(y0 // tile_size), int(math.ceil(y1 / tile_size)) - 1
        for tx in range(max(tx0, 0), min(tx1, 2**z - 1) + 1):
            for ty in range(max(ty0, 0), min(ty1, 2**z - 1) + 1):
                arr = np.zeros((tile_size, tile_size, 4), dtype=np.uint8)
                any_px = False
                for j in range(tile_size):
                    lon_row = []
                    for i in range(tile_size):
                        lon, lat = pixel_to_lonlat(
                            tx * tile_size + i + 0.5, ty * tile_size + j + 0.5, z, tile_size
                        )
                        lon_row.append((lon, lat))
                    for i, (lon, lat) in enumerate(lon_row):
                        v = sample(lon, lat)
                        if v is None or (isinstance(v, float) and math.isnan(v)):
                            continue
                        arr[j, i] = color(v)
                        any_px = True
                if not any_px:
                    continue
                p = out_dir / str(z) / str(tx) / f"{ty}.png"
                p.parent.mkdir(parents=True, exist_ok=True)
                Image.fromarray(arr, "RGBA").save(p, optimize=True)
                written.append(p)
    return written


def pmtiles_from_dir(tiles_dir: Path, out: Path) -> Path:
    """Package a z/x/y PNG tree into a raster PMTiles archive using the `pmtiles` CLI when
    available (go-pmtiles). Falls back to raising so callers can ship the directory instead."""
    cli = shutil.which("pmtiles")
    if not cli:
        raise RuntimeError("pmtiles CLI not found; install go-pmtiles in CI")
    # go-pmtiles converts from mbtiles; build an mbtiles first with mb-util-like logic.
    import sqlite3

    mb = out.with_suffix(".mbtiles")
    if mb.exists():
        mb.unlink()
    con = sqlite3.connect(mb)
    con.executescript(
        """
        CREATE TABLE metadata (name text, value text);
        CREATE TABLE tiles (zoom_level integer, tile_column integer, tile_row integer, tile_data blob);
        CREATE UNIQUE INDEX tile_index on tiles (zoom_level, tile_column, tile_row);
        """
    )
    con.executemany(
        "INSERT INTO metadata VALUES (?, ?)",
        [("name", out.stem), ("format", "png"), ("type", "overlay"), ("version", "1")],
    )
    for png in tiles_dir.rglob("*.png"):
        z, x = int(png.parent.parent.name), int(png.parent.name)
        y = int(png.stem)
        tms_y = (2**z - 1) - y
        con.execute("INSERT INTO tiles VALUES (?,?,?,?)", (z, x, tms_y, png.read_bytes()))
    con.commit()
    con.close()
    subprocess.run([cli, "convert", str(mb), str(out)], check=True)
    mb.unlink(missing_ok=True)
    return out
