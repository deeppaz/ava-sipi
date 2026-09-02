"""Offline sample rivers built from Natural Earth 50m rivers (public domain).

HydroRIVERS is 544 MB and needs tippecanoe, so `data/samples` ships a small spine derived from
Natural Earth instead. Mean discharge comes from published long-term averages for well-known
rivers (table below, m3/s) and an order-based estimate otherwise; the manifest says so.
Flow direction is inferred: the mouth is the end closest to the coast or to a larger river.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np

# Long-term mean discharge near the mouth, m3/s (rounded, widely published values:
# GRDC / Milliman & Farnsworth 2011 / national agencies). Sample data only.
KNOWN_DISCHARGE: dict[str, float] = {
    "Amazonas": 209000,
    "Amazon": 209000,
    "Congo": 41000,
    "Orinoco": 33000,
    "Chang Jiang": 30000,
    "Yangtze": 30000,
    "Brahmaputra": 19800,
    "Yenisey": 19600,
    "Rio de la Plata": 22000,
    "Paraná": 17300,
    "Parana": 17300,
    "Lena": 17100,
    "Mississippi": 16800,
    "St. Lawrence": 16800,
    "Mekong": 16000,
    "Irrawaddy": 13000,
    "Ganges": 12000,
    "Ob": 12500,
    "Amur": 11400,
    "Mackenzie": 10300,
    "Xi Jiang": 7500,
    "Columbia": 7500,
    "Magdalena": 7200,
    "Indus": 6600,
    "Danube": 6500,
    "Yukon": 6400,
    "Niger": 5600,
    "Ottawa": 1950,
    "Salween": 5000,
    "Volga": 8060,
    "Zambezi": 3400,
    "Nelson": 2800,
    "Nile": 2800,
    "Rhine": 2900,
    "Huang He": 2100,
    "Tigris": 1000,
    "Euphrates": 356,
    "Fırat": 356,
    "Dicle": 1000,
    "Colorado": 640,
    "Murray": 767,
    "Rhône": 1700,
    "Rhone": 1700,
    "Po": 1540,
    "Elbe": 870,
    "Loire": 900,
    "Dnieper": 1670,
    "Don": 935,
    "Ural": 400,
    "Syr Darya": 700,
    "Amu Darya": 1400,
    "Orange": 365,
    "Limpopo": 170,
    "Senegal": 640,
    "Godavari": 3500,
    "Krishna": 1640,
    "Narmada": 1450,
    "Missouri": 2450,
    "Ohio": 7960,
    "Tennessee": 1900,
    "Arkansas": 1100,
    "Red": 900,
    "Rio Grande": 100,
    "Fraser": 3500,
    "Nelson River": 2800,
    "São Francisco": 2800,
    "Tocantins": 11000,
    "Xingu": 9700,
    "Madeira": 31200,
    "Negro": 28400,
    "Ucayali": 13500,
    "Marañón": 16000,
    "Purus": 11000,
    "Japurá": 18600,
    "Tapajós": 13500,
    "Uruguay": 4600,
    "Paraguay": 4300,
    "Kasai": 11000,
    "Ubangi": 4700,
    "Lualaba": 20000,
    "Sanaga": 2060,
    "Volta": 1200,
    "Benue": 3400,
    "Chari": 1100,
    "Shebelle": 90,
    "Jubba": 190,
    "Tana": 160,
    "Rufiji": 900,
    "Okavango": 320,
    "Kolyma": 3800,
    "Indigirka": 1800,
    "Yana": 1100,
    "Olenek": 1200,
    "Khatanga": 3200,
    "Pechora": 4100,
    "Northern Dvina": 3300,
    "Neva": 2500,
    "Vistula": 1080,
    "Oder": 570,
    "Seine": 500,
    "Garonne": 650,
    "Ebro": 430,
    "Tagus": 440,
    "Douro": 700,
    "Kızılırmak": 180,
    "Sakarya": 190,
    "Kura": 575,
    "Aras": 285,
    "Karun": 575,
    "Helmand": 140,
    "Tarim": 150,
    "Ili": 480,
    "Irtysh": 3000,
    "Angara": 4500,
    "Selenga": 935,
    "Songhua": 2460,
    "Liao": 100,
    "Hai": 60,
    "Huai": 1100,
    "Han": 1600,
    "Pearl": 9500,
    "Hong (Red)": 3900,
    "Chao Phraya": 880,
    "Kapuas": 6500,
    "Mahakam": 3000,
    "Sepik": 3800,
    "Fly": 6000,
    "Murrumbidgee": 120,
    "Darling": 90,
    "Waikato": 340,
    "Clutha": 615,
    "Saskatchewan": 640,
    "Churchill": 1200,
    "Athabasca": 780,
    "Peace": 1900,
    "Slave": 3400,
    "Back": 600,
    "Thelon": 800,
    "Koksoak": 2400,
    "La Grande": 3400,
    "Snake": 1600,
    "Sacramento": 660,
    "San Joaquin": 130,
    "Willamette": 940,
    "Hudson": 620,
    "Susquehanna": 1150,
    "Potomac": 320,
    "Alabama": 900,
    "Apalachicola": 700,
    "Brazos": 250,
    "Usumacinta": 1900,
    "Grijalva": 700,
    "Balsas": 400,
    "Lerma": 40,
    "Yaqui": 90,
    "Cauca": 2400,
    "Atrato": 4900,
    "Essequibo": 4500,
    "Maroni": 1700,
    "Oyapock": 800,
    "Parnaíba": 760,
    "Jequitinhonha": 400,
    "Doce": 900,
    "Paraíba do Sul": 1000,
    "Biobío": 1000,
    "Maule": 470,
    "Santa Cruz": 700,
    "Negro (Argentina)": 860,
    "Chubut": 50,
    "Colorado (Argentina)": 130,
    "Salado": 90,
    "Dvina": 3300,
    "Kama": 3800,
    "Oka": 1260,
    "Belaya": 950,
    "Vyatka": 890,
    "Tobol": 800,
    "Ishim": 60,
    "Vitim": 2000,
    "Aldan": 5200,
    "Vilyuy": 1480,
    "Zeya": 1900,
    "Ussuri": 1150,
    "Sungari": 2460,
    "Tumen": 200,
    "Yalu": 1040,
}

# Order-based estimate (m3/s) when a river is not in the table.
ORDER_ESTIMATE = {9: 15000.0, 8: 5000.0, 7: 1500.0, 6: 500.0, 5: 150.0}


def order_from_scalerank(scalerank: int | None) -> int:
    if scalerank is None:
        return 6
    return {1: 9, 2: 9, 3: 8, 4: 7, 5: 6, 6: 6}.get(int(scalerank), 6)


def _coords_of(feature: dict[str, Any]) -> list[list[list[float]]]:
    geom = feature["geometry"]
    if geom["type"] == "LineString":
        return [geom["coordinates"]]
    if geom["type"] == "MultiLineString":
        return list(geom["coordinates"])
    return []


def _nearest_dist_deg(pt: tuple[float, float], arr: np.ndarray) -> float:
    if arr.size == 0:
        return math.inf
    d = arr - np.array(pt)
    d[:, 0] *= math.cos(math.radians(pt[1]))
    return float(np.sqrt((d * d).sum(axis=1)).min())


def orient_lines(lines: list[dict[str, Any]], coast: np.ndarray) -> None:
    """Reverse coordinate arrays in place so each line runs source -> mouth.

    Mouth heuristic: the endpoint nearer to the coastline or to a vertex of a river with
    strictly greater order (tributaries end in larger rivers).
    """
    by_order: dict[int, np.ndarray] = {}
    for o in sorted({ln["order"] for ln in lines}):
        pts = [
            c
            for ln in lines
            if ln["order"] > o
            for c in ln["coords"][:: max(1, len(ln["coords"]) // 50)]
        ]
        by_order[o] = np.array(pts, dtype=float) if pts else np.zeros((0, 2))
    for ln in lines:
        coords = ln["coords"]
        start = (coords[0][0], coords[0][1])
        end = (coords[-1][0], coords[-1][1])
        bigger = by_order[ln["order"]]
        d_start = min(_nearest_dist_deg(start, coast), _nearest_dist_deg(start, bigger))
        d_end = min(_nearest_dist_deg(end, coast), _nearest_dist_deg(end, bigger))
        if d_start < d_end:
            ln["coords"] = coords[::-1]


def coast_vertices(land_fc: dict[str, Any], step: int = 3) -> np.ndarray:
    pts: list[list[float]] = []
    for f in land_fc.get("features", []):
        g = f["geometry"]
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        for poly in polys:
            ring = poly[0]
            pts.extend(ring[::step])
    return np.array(pts, dtype=float) if pts else np.zeros((0, 2))


def build_sample_spine(
    ne_rivers: dict[str, Any], ne_land: dict[str, Any]
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Return (spine FeatureCollection, discharge sample points)."""
    lines: list[dict[str, Any]] = []
    for f in ne_rivers.get("features", []):
        p = f.get("properties") or {}
        if p.get("featurecla") not in ("River", "River (Intermittent)"):
            continue
        name = p.get("name_en") or p.get("name")
        order = order_from_scalerank(p.get("scalerank"))
        mean = KNOWN_DISCHARGE.get(name or "", ORDER_ESTIMATE.get(order, 300.0))
        for part in _coords_of(f):
            if len(part) < 2:
                continue
            lines.append(
                {
                    "name": name,
                    "order": order,
                    "mean": float(mean),
                    "coords": [[round(c[0], 3), round(c[1], 3)] for c in part],
                }
            )
    orient_lines(lines, coast_vertices(ne_land))

    features: list[dict[str, Any]] = []
    points: list[dict[str, Any]] = []
    from common.geo import line_length_km, line_midpoint

    for i, ln in enumerate(lines, start=1):
        props: dict[str, Any] = {
            "id": i,
            "order": ln["order"],
            "meanDischarge": ln["mean"],
            "lengthKm": round(line_length_km(ln["coords"]), 1),
        }
        if ln["name"]:
            props["name"] = ln["name"]
        features.append(
            {
                "type": "Feature",
                "id": i,
                "geometry": {"type": "LineString", "coordinates": ln["coords"]},
                "properties": props,
            }
        )
        if ln["order"] >= 6:
            mlon, mlat = line_midpoint(ln["coords"])
            points.append(
                {"id": i, "lon": round(mlon, 4), "lat": round(mlat, 4), "meanDischarge": ln["mean"]}
            )
    points.sort(key=lambda p: -p["meanDischarge"])
    return {"type": "FeatureCollection", "features": features}, points
