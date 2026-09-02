"""Minimal PMTiles v3 writer (root directory only, gzip internal compression).

Spec: https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md
Used to package raster PNG tiles produced at ingest (drought, groundwater) without needing
the go-pmtiles CLI. Verified against the reference JS reader in ingest/tests.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import struct
from dataclasses import dataclass
from pathlib import Path

TILE_TYPES = {"unknown": 0, "mvt": 1, "png": 2, "jpeg": 3, "webp": 4, "avif": 5}
COMPRESSION = {"unknown": 0, "none": 1, "gzip": 2, "brotli": 3, "zstd": 4}
HEADER_SIZE = 127
MAX_ROOT_ENTRIES = 20000  # keep a single root directory; plenty for z0-z8 rasters


def _rotate(n: int, xy: list[int], rx: int, ry: int) -> None:
    if ry == 0:
        if rx == 1:
            xy[0] = n - 1 - xy[0]
            xy[1] = n - 1 - xy[1]
        xy[0], xy[1] = xy[1], xy[0]


def zxy_to_tile_id(z: int, x: int, y: int) -> int:
    if z > 26:
        raise ValueError("zoom > 26 not supported")
    if x >= 2**z or y >= 2**z:
        raise ValueError("tile outside zoom")
    acc = sum(4**i for i in range(z))
    n = 2**z
    xy = [x, y]
    d = 0
    s = n // 2
    while s > 0:
        rx = 1 if (xy[0] & s) > 0 else 0
        ry = 1 if (xy[1] & s) > 0 else 0
        d += s * s * ((3 * rx) ^ ry)
        _rotate(s, xy, rx, ry)
        s //= 2
    return acc + d


def _varint(v: int) -> bytes:
    out = bytearray()
    while True:
        b = v & 0x7F
        v >>= 7
        if v:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


@dataclass(slots=True)
class Entry:
    tile_id: int
    offset: int
    length: int
    run_length: int = 1


def serialize_directory(entries: list[Entry]) -> bytes:
    entries = sorted(entries, key=lambda e: e.tile_id)
    out = bytearray(_varint(len(entries)))
    last = 0
    for e in entries:
        out += _varint(e.tile_id - last)
        last = e.tile_id
    for e in entries:
        out += _varint(e.run_length)
    for e in entries:
        out += _varint(e.length)
    for i, e in enumerate(entries):
        if i > 0 and e.offset == entries[i - 1].offset + entries[i - 1].length:
            out += _varint(0)
        else:
            out += _varint(e.offset + 1)
    return bytes(out)


def write_pmtiles(
    tiles: dict[tuple[int, int, int], bytes],
    out: Path,
    tile_type: str = "png",
    metadata: dict | None = None,
    bounds: tuple[float, float, float, float] = (-180.0, -85.05112878, 180.0, 85.05112878),
    center: tuple[float, float, int] | None = None,
) -> Path:
    """Write `tiles` ({(z,x,y): bytes}) into a PMTiles v3 archive at `out`."""
    if not tiles:
        raise ValueError("no tiles")
    if len(tiles) > MAX_ROOT_ENTRIES:
        raise ValueError(f"{len(tiles)} tiles exceed single-root-directory writer limit")

    # Deduplicate identical tile contents; write data in tile-id order (clustered).
    ordered = sorted(
        ((zxy_to_tile_id(z, x, y), (z, x, y)) for (z, x, y) in tiles), key=lambda t: t[0]
    )
    data = bytearray()
    by_hash: dict[str, tuple[int, int]] = {}
    entries: list[Entry] = []
    for tile_id, zxy in ordered:
        blob = tiles[zxy]
        h = hashlib.sha1(blob).hexdigest()
        if h in by_hash:
            off, ln = by_hash[h]
        else:
            off, ln = len(data), len(blob)
            data += blob
            by_hash[h] = (off, ln)
        entries.append(Entry(tile_id=tile_id, offset=off, length=ln))

    # Merge consecutive identical entries into run lengths.
    merged: list[Entry] = []
    for e in entries:
        if (
            merged
            and merged[-1].offset == e.offset
            and merged[-1].length == e.length
            and merged[-1].tile_id + merged[-1].run_length == e.tile_id
        ):
            merged[-1].run_length += 1
        else:
            merged.append(Entry(e.tile_id, e.offset, e.length, 1))

    root = gzip.compress(serialize_directory(merged), mtime=0)
    zooms = [z for (z, _, _) in tiles]
    min_zoom, max_zoom = min(zooms), max(zooms)
    meta = {"name": out.stem, "format": tile_type, "type": "overlay", "version": "1"}
    if metadata:
        meta.update(metadata)
    meta_bytes = gzip.compress(json.dumps(meta).encode("utf-8"), mtime=0)

    root_off = HEADER_SIZE
    meta_off = root_off + len(root)
    leaf_off = meta_off + len(meta_bytes)
    tile_off = leaf_off  # no leaf directories
    if center is None:
        center = ((bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2, min_zoom)

    header = struct.pack(
        "<7sBQQQQQQQQQQQBBBBBBiiiiBii",
        b"PMTiles",
        3,
        root_off,
        len(root),
        meta_off,
        len(meta_bytes),
        leaf_off,
        0,
        tile_off,
        len(data),
        len(tiles),  # addressed tiles
        len(merged),  # tile entries
        len(by_hash),  # tile contents
        1,  # clustered
        COMPRESSION["gzip"],
        COMPRESSION["none"],  # PNG is already compressed
        TILE_TYPES[tile_type],
        min_zoom,
        max_zoom,
        int(round(bounds[0] * 1e7)),
        int(round(bounds[1] * 1e7)),
        int(round(bounds[2] * 1e7)),
        int(round(bounds[3] * 1e7)),
        int(center[2]),
        int(round(center[0] * 1e7)),
        int(round(center[1] * 1e7)),
    )
    assert len(header) == HEADER_SIZE, len(header)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("wb") as fh:
        fh.write(header)
        fh.write(root)
        fh.write(meta_bytes)
        fh.write(data)
    return out
