"""GDACS events -> events/current.geojson (floods, droughts, tropical cyclones, last 30 days)."""

from __future__ import annotations

import logging
import xml.etree.ElementTree as ET
from datetime import UTC, datetime, timedelta
from typing import Any

from common.config import PipelineConfig, iso
from common.fetch import Fetcher, FetchError
from common.geo import bbox_of, polygon_centroid, round_coords
from common.manifest import ArtifactRef, LayerManifest
from common.pipeline import load_fixture_or, tmp_dir, versions_with, write_json
from common.storage import Storage
from common.validate import validate

log = logging.getLogger(__name__)

SEARCH_URL = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH"
RSS_URL = "https://www.gdacs.org/xml/rss.xml"
TYPE_MAP = {"FL": "flood", "DR": "drought", "TC": "cyclone"}
SEVERITY_MAP = {"green": "green", "orange": "orange", "red": "red"}
# Polygon classes in preference order per event type (Poly_Global is a coarse bounding area; skipped).
POLY_PREFERENCE = {
    "FL": ("Poly_Affected",),
    "DR": ("Poly_Affected", "Poly_Area"),
    "TC": ("Poly_Red", "Poly_Orange", "Poly_Green"),
}
MAX_POLY_VERTICES = 600
NS = {"gdacs": "http://www.gdacs.org", "georss": "http://www.georss.org/georss"}

ATTRIBUTION = {
    "name": "GDACS — Global Disaster Alert and Coordination System (EC JRC / UN OCHA)",
    "url": "https://www.gdacs.org",
    "license": "Free use with attribution (GDACS terms of use)",
}


def _iso_utc(s: str | None) -> str:
    """GDACS timestamps are UTC without a suffix, e.g. 2026-08-27T21:00:00."""
    if not s:
        return iso(datetime.now(UTC))
    s = s.strip()
    if s.endswith("Z") or "+" in s[10:]:
        return iso(datetime.fromisoformat(s.replace("Z", "+00:00")))
    return iso(datetime.fromisoformat(s).replace(tzinfo=UTC))


def _decimate_ring(ring: list[list[float]], max_vertices: int) -> list[list[float]]:
    if len(ring) <= max_vertices:
        return ring
    step = len(ring) / max_vertices
    out = [ring[int(i * step)] for i in range(max_vertices)]
    if out[0] != out[-1]:
        out.append(out[0])
    return out


def _simplify_geometry(geom: dict[str, Any]) -> dict[str, Any]:
    if geom["type"] == "Polygon":
        rings = [_decimate_ring(r, MAX_POLY_VERTICES) for r in geom["coordinates"][:1]]
        return round_coords({"type": "Polygon", "coordinates": rings}, 3)
    if geom["type"] == "MultiPolygon":
        polys = [[_decimate_ring(p[0], MAX_POLY_VERTICES // 2)] for p in geom["coordinates"][:8]]
        return round_coords({"type": "MultiPolygon", "coordinates": polys}, 3)
    return round_coords(geom, 3)


def _pick_polygon(fc: dict[str, Any], event_type: str) -> dict[str, Any] | None:
    feats = fc.get("features") or []
    for cls in POLY_PREFERENCE.get(event_type, ()):
        for f in feats:
            geom = f.get("geometry") or {}
            if f.get("properties", {}).get("Class") == cls and geom.get("type") in (
                "Polygon",
                "MultiPolygon",
            ):
                return _simplify_geometry(geom)
    return None


def _population_from_rss(xml_text: str) -> dict[str, int]:
    """eventid -> affected population from the GDACS RSS feed (SEARCH JSON lacks it)."""
    out: dict[str, int] = {}
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        log.warning("RSS parse failed: %s", exc)
        return out
    for item in root.iter("item"):
        eid = item.findtext("gdacs:eventid", default="", namespaces=NS)
        pop_el = item.find("gdacs:population", NS)
        if not eid or pop_el is None:
            continue
        raw = pop_el.get("value") or (pop_el.text or "")
        digits = "".join(ch for ch in raw if ch.isdigit())
        if digits:
            out[eid] = int(digits)
    return out


def _search(fetcher: Fetcher, event_type: str, since: datetime, until: datetime) -> dict[str, Any]:
    params = {
        "eventlist": event_type,
        "alertlevel": "Green;Orange;Red",
        "fromDate": since.strftime("%Y-%m-%d"),
        "toDate": until.strftime("%Y-%m-%d"),
        "pagesize": 200,
    }
    return fetcher.get_json(SEARCH_URL, params=params, use_cache=False)


def build_features(
    search_results: list[dict[str, Any]],
    populations: dict[str, int],
    fetch_polygon: Any,
) -> list[dict[str, Any]]:
    features: list[dict[str, Any]] = []
    seen: set[str] = set()
    for fc in search_results:
        for f in fc.get("features", []):
            p = f.get("properties", {})
            et = p.get("eventtype")
            if et not in TYPE_MAP:
                continue
            eid = str(p.get("eventid"))
            if eid in seen:
                continue
            seen.add(eid)
            sev = SEVERITY_MAP.get(str(p.get("alertlevel", "")).lower(), "green")
            geom = f.get("geometry") or {}
            if geom.get("type") != "Point":
                continue
            lon, lat = float(geom["coordinates"][0]), float(geom["coordinates"][1])
            centroid = [round(lon, 4), round(lat, 4)]
            out_geom: dict[str, Any] = {"type": "Point", "coordinates": centroid}
            geometry_url = (p.get("url") or {}).get("geometry")
            if geometry_url and sev in ("orange", "red") and fetch_polygon is not None:
                try:
                    poly_fc = fetch_polygon(geometry_url)
                    poly = _pick_polygon(poly_fc, et)
                    if poly:
                        out_geom = poly
                        ring = (
                            poly["coordinates"][0]
                            if poly["type"] == "Polygon"
                            else poly["coordinates"][0][0]
                        )
                        cx, cy = polygon_centroid(ring)
                        if abs(cx - lon) < 15 and abs(cy - lat) < 15:
                            centroid = [round(cx, 4), round(cy, 4)]
                except FetchError as exc:
                    log.warning("polygon fetch failed for %s: %s", eid, exc)
            sev_data = p.get("severitydata") or {}
            props: dict[str, Any] = {
                "id": f"gdacs-{et}-{eid}",
                "type": TYPE_MAP[et],
                "severity": sev,
                "title": p.get("name") or p.get("eventname") or f"{TYPE_MAP[et]} {eid}",
                "startedAt": _iso_utc(p.get("fromdate")),
                "updatedAt": _iso_utc(p.get("datemodified") or p.get("todate")),
                "sourceUrl": (p.get("url") or {}).get("report")
                or f"https://www.gdacs.org/report.aspx?eventid={eid}&eventtype={et}",
                "source": "gdacs",
                "centroid": centroid,
            }
            if p.get("country"):
                props["country"] = p["country"]
            if p.get("iso3"):
                props["iso3"] = p["iso3"]
            if sev_data.get("severitytext"):
                props["severityText"] = str(sev_data["severitytext"]).strip()
            if eid in populations:
                props["affectedPopulation"] = populations[eid]
            features.append(
                {"type": "Feature", "id": props["id"], "geometry": out_geom, "properties": props}
            )
    # red first, then orange, then green; newest first within a level
    order = {"red": 0, "orange": 1, "green": 2}
    features.sort(
        key=lambda f: (order[f["properties"]["severity"]], f["properties"]["updatedAt"]),
        reverse=False,
    )
    return features


def run(cfg: PipelineConfig) -> LayerManifest:
    layer = "events"
    until = cfg.now
    since = until - timedelta(days=30)
    with Fetcher(cache_dir=cfg.out_dir / ".cache", per_second=4) as fetcher:
        search_results = load_fixture_or(
            cfg,
            "gdacs_search",
            lambda: [_search(fetcher, et, since, until) for et in ("FL", "DR", "TC")],
        )
        if isinstance(search_results, dict):
            search_results = [search_results]
        rss_text = None
        if "gdacs_rss" in cfg.fixtures:
            rss_text = cfg.fixtures["gdacs_rss"].read_text(encoding="utf-8")
        else:
            try:
                rss_text = fetcher.get_text(RSS_URL, use_cache=False)
            except FetchError as exc:
                log.warning("RSS unavailable: %s", exc)
        populations = _population_from_rss(rss_text) if rss_text else {}
        fetch_polygon = (
            None if cfg.fixtures.get("gdacs_no_polygons") else (lambda url: fetcher.get_json(url))
        )
        if "gdacs_polygon" in cfg.fixtures:
            poly_fixture = load_fixture_or(cfg, "gdacs_polygon", lambda: {})
            fetch_polygon = lambda _url: poly_fixture  # noqa: E731
        features = build_features(search_results, populations, fetch_polygon)

    fc = {"type": "FeatureCollection", "features": features}
    validate("water-event-collection", fc)
    tmp = tmp_dir(cfg, layer)
    path = write_json(tmp / "current.geojson", fc)
    storage = Storage(cfg.out_dir, cfg.public_base_url, cfg.publish)
    stored = storage.put(path, layer, cfg.version, "current.geojson", cache_seconds=300)
    newest = max((f["properties"]["updatedAt"] for f in features), default=iso(cfg.now))
    pts = [f["properties"]["centroid"] for f in features]
    return LayerManifest(
        id=layer,
        version=cfg.version,
        generatedAt=iso(cfg.now),
        sourceUpdatedAt=newest,
        stale=False,
        artifacts=[ArtifactRef(kind="geojson", url=stored.url, bytes=stored.bytes, name="current")],
        attribution=ATTRIBUTION,
        coverage="global",
        bbox=bbox_of(pts) if pts else None,
        sample=cfg.sample,
        versions=versions_with(cfg),
        notes=["events.window30d"],
    )
