"""Small dependency-free geometry helpers (no shapely needed for the light pipelines)."""

from __future__ import annotations

import math
from collections.abc import Iterable, Sequence

Coord = Sequence[float]


def haversine_km(a: Coord, b: Coord) -> float:
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    d = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 2 * 6371.0088 * math.asin(math.sqrt(d))


def line_length_km(coords: Sequence[Coord]) -> float:
    return sum(haversine_km(coords[i], coords[i + 1]) for i in range(len(coords) - 1))


def line_midpoint(coords: Sequence[Coord]) -> tuple[float, float]:
    """Point at half the geodesic length along a polyline."""
    total = line_length_km(coords)
    if total == 0 or len(coords) < 2:
        return float(coords[0][0]), float(coords[0][1])
    half = total / 2
    acc = 0.0
    for i in range(len(coords) - 1):
        seg = haversine_km(coords[i], coords[i + 1])
        if acc + seg >= half:
            t = (half - acc) / seg if seg else 0
            return (
                coords[i][0] + (coords[i + 1][0] - coords[i][0]) * t,
                coords[i][1] + (coords[i + 1][1] - coords[i][1]) * t,
            )
        acc += seg
    return float(coords[-1][0]), float(coords[-1][1])


def bbox_of(points: Iterable[Coord]) -> list[float]:
    xs, ys = [], []
    for p in points:
        xs.append(p[0])
        ys.append(p[1])
    if not xs:
        return [-180.0, -90.0, 180.0, 90.0]
    return [min(xs), min(ys), max(xs), max(ys)]


def polygon_centroid(ring: Sequence[Coord]) -> tuple[float, float]:
    """Planar centroid of a ring; good enough for labels/representative points."""
    a = cx = cy = 0.0
    n = len(ring)
    for i in range(n - 1):
        x0, y0 = ring[i][0], ring[i][1]
        x1, y1 = ring[i + 1][0], ring[i + 1][1]
        cross = x0 * y1 - x1 * y0
        a += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    if abs(a) < 1e-12:
        return float(sum(p[0] for p in ring) / n), float(sum(p[1] for p in ring) / n)
    a *= 0.5
    return cx / (6 * a), cy / (6 * a)


def round_coords(geom: dict, ndigits: int = 5) -> dict:
    """Round coordinates in a GeoJSON geometry to shrink files (~1 m at 5 digits)."""

    def rec(c):
        if isinstance(c, (int, float)):
            return round(float(c), ndigits)
        return [rec(x) for x in c]

    return {**geom, "coordinates": rec(geom["coordinates"])}
