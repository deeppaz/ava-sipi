from __future__ import annotations

import json
import subprocess
from pathlib import Path

import numpy as np
import pytest

from common.colors import RIVER_RAMP, mix_oklch
from common.geo import haversine_km, line_midpoint, polygon_centroid
from common.manifest import (
    ArtifactRef,
    LayerManifest,
    build_root_manifest,
    mark_failure,
    write_layer_manifest,
)
from common.pmtiles_writer import serialize_directory, write_pmtiles, zxy_to_tile_id
from common.raster import Grid, grid_to_tiles, lut_from_ramp, tile_lonlat
from common.units import cfs_to_m3s, ft_to_m, percentile_from_quantiles
from common.validate import ValidationError, validate


def test_units():
    assert cfs_to_m3s(1000) == pytest.approx(28.3168, rel=1e-4)
    assert ft_to_m(10) == pytest.approx(3.048)
    q = [1, 2, 4, 8, 16, 32, 64]
    assert percentile_from_quantiles(8, q) == 50
    assert percentile_from_quantiles(0.5, q) == pytest.approx(2.5)
    assert percentile_from_quantiles(1000, q) == 100
    assert 75 < percentile_from_quantiles(20, q) < 90


def test_geo():
    assert haversine_km((0, 0), (0, 1)) == pytest.approx(111.19, rel=1e-3)
    mid = line_midpoint([[0, 0], [0, 2]])
    assert mid[1] == pytest.approx(1.0, abs=1e-6)
    assert polygon_centroid([[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]) == pytest.approx((1, 1))


def test_ramp_oklch_has_no_grey_dip():
    # midway between ochre and blue must keep chroma (no muddy grey)
    r, g, b = mix_oklch("#C8873A", "#7FB8D6", 0.5)
    assert max(r, g, b) - min(r, g, b) > 0.08
    assert RIVER_RAMP.rgba(1.0)[:3] == (0x7F, 0xB8, 0xD6)
    assert RIVER_RAMP.rgba(10)[:3] == (0xEA, 0xF4, 0xF8)


def test_validate_rejects_bad_manifest():
    with pytest.raises(ValidationError):
        validate("layer-manifest", {"id": "rivers"})


def test_manifest_roundtrip(tmp_path: Path):
    m = LayerManifest(
        id="events",
        version="20260902T1500",
        generatedAt="2026-09-02T15:00:00Z",
        sourceUpdatedAt="2026-09-02T14:00:00Z",
        stale=False,
        artifacts=[
            ArtifactRef(
                kind="geojson", url="events/20260902T1500/current.geojson", bytes=10, name="current"
            )
        ],
        attribution={"name": "GDACS", "url": "https://www.gdacs.org", "license": "attribution"},
        coverage="global",
    )
    path = write_layer_manifest(m, tmp_path)
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["artifacts"][0]["name"] == "current"
    root = build_root_manifest(tmp_path)
    assert "events" in root["layers"]


def test_tile_id_matches_reference_values():
    # Reference values from the PMTiles spec / JS implementation
    assert zxy_to_tile_id(0, 0, 0) == 0
    assert zxy_to_tile_id(1, 0, 0) == 1
    assert zxy_to_tile_id(1, 0, 1) == 2
    assert zxy_to_tile_id(1, 1, 1) == 3
    assert zxy_to_tile_id(1, 1, 0) == 4
    assert zxy_to_tile_id(2, 0, 0) == 5
    ids = {zxy_to_tile_id(3, x, y) for x in range(8) for y in range(8)}
    assert ids == set(range(21, 21 + 64))


def test_directory_serialization_is_compact():
    from common.pmtiles_writer import Entry

    data = serialize_directory([Entry(0, 0, 10), Entry(1, 10, 10), Entry(2, 20, 5)])
    assert data[0] == 3  # entry count varint


def test_grid_to_tiles_and_pmtiles_roundtrip_with_js_reader(tmp_path: Path):
    vals = np.tile(np.linspace(-20, 20, 72, dtype=np.float32), (36, 1))
    grid = Grid(values=vals, lon0=-180, lat0=90, dlon=5, dlat=5)
    lon, lat = tile_lonlat(1, 0, 0)
    assert lon.shape == (256, 256) and lat[0, 0] > lat[-1, 0]
    from common.colors import GROUNDWATER_RAMP

    tiles = grid_to_tiles(grid, lut_from_ramp(GROUNDWATER_RAMP.rgba, -20, 20), 0, 2)
    assert len(tiles) == 1 + 4 + 16
    out = tmp_path / "t.pmtiles"
    write_pmtiles(tiles, out, tile_type="png")
    assert out.stat().st_size > 127

    # Verify with the reference JavaScript reader (pmtiles npm package in the workspace).
    repo = Path(__file__).resolve().parents[2]
    pm_pkg = repo / "apps" / "web" / "node_modules" / "pmtiles"
    if not pm_pkg.exists():
        pytest.skip("pmtiles npm package not installed")
    script = f"""
    import {{ PMTiles, FileSource }} from 'pmtiles';
    import fs from 'node:fs';
    class Src {{ constructor(p) {{ this.p = p; }} getKey() {{ return this.p; }}
      async getBytes(off, len) {{ const fd = fs.openSync(this.p, 'r'); const b = Buffer.alloc(len); fs.readSync(fd, b, 0, len, off); fs.closeSync(fd);
        return {{ data: b.buffer.slice(b.byteOffset, b.byteOffset + len) }}; }} }}
    const p = new PMTiles(new Src({json.dumps(str(out).replace(chr(92), "/"))}));
    const h = await p.getHeader();
    const t = await p.getZxy(2, 1, 1);
    const meta = await p.getMetadata();
    console.log(JSON.stringify({{ minZoom: h.minZoom, maxZoom: h.maxZoom, tileType: h.tileType, n: h.numAddressedTiles, len: t ? t.data.byteLength : -1, format: meta.format }}));
    """
    js = tmp_path / "check.mjs"
    js.write_text(script, encoding="utf-8")
    res = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        capture_output=True,
        text=True,
        cwd=repo / "apps" / "web",
        check=False,
    )
    assert res.returncode == 0, res.stderr
    info = json.loads(res.stdout.strip().splitlines()[-1])
    assert info["minZoom"] == 0 and info["maxZoom"] == 2 and info["tileType"] == 2
    assert info["n"] == 21 and info["len"] > 0 and info["format"] == "png"


def test_stale_badge_only_after_three_failures(tmp_path: Path):
    m = LayerManifest(
        id="gauges",
        version="20260902T1500",
        generatedAt="2026-09-02T15:00:00Z",
        sourceUpdatedAt="2026-09-02T14:00:00Z",
        stale=False,
        artifacts=[
            ArtifactRef(kind="json", url="gauges/latest/latest.json", bytes=1, name="latest")
        ],
        attribution={
            "name": "USGS",
            "url": "https://waterdata.usgs.gov",
            "license": "public domain",
        },
        coverage="regional",
    )
    write_layer_manifest(m, tmp_path)
    assert mark_failure("gauges", tmp_path) == 1
    assert json.loads((tmp_path / "gauges.json").read_text(encoding="utf-8"))["stale"] is False
    mark_failure("gauges", tmp_path)
    assert mark_failure("gauges", tmp_path) == 3
    assert json.loads((tmp_path / "gauges.json").read_text(encoding="utf-8"))["stale"] is True
