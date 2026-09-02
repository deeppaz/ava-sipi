# rivers

| | |
|---|---|
| Source | HydroRIVERS v1.0 (HydroSHEDS, Lehner & Grill 2013) — 8.5 M river reaches, 15 arc-second |
| Download | `https://data.hydrosheds.org/file/HydroRIVERS/HydroRIVERS_v10_shp.zip` (544 MB, shapefile) |
| Fields | `HYRIV_ID`, `NEXT_DOWN`, `MAIN_RIV`, `LENGTH_KM`, `DIS_AV_CMS` (long-term mean discharge, m³/s), `ORD_STRA` (Strahler), `UPLAND_SKM` |
| Refresh | yearly / when the source version changes (`ingest-monthly.yml`, gated) |
| Auth | none |
| Outputs | `rivers/<version>/rivers.pmtiles` (network, z1–z10) · `spine.geojson` (order ≥ 7 reaches) · `points.json` (order ≥ 6 midpoints for Open-Meteo) |

## Method

1. Read the shapefile with `pyogrio` filtered to `ORD_STRA >= 3`.
2. Names: HydroRIVERS has none. Reaches with order ≥ 6 get the nearest Natural Earth 10 m
   river centreline name within 5 km (`sjoin_nearest`).
3. Direction: HydroRIVERS geometries are digitised upstream → downstream (verified in the
   technical documentation, §"Line direction"); `NEXT_DOWN` is only used for chain merging.
4. Network tiles: tippecanoe `--minimum-zoom=1 --maximum-zoom=10`, attributes limited with `-y`
   to `id`, `order`, `meanDischarge`, `name`, plus a `-J` zoom filter implementing the LOD table
   (zoom < 3 order ≥ 7 · 3–5 ≥ 5 · 5–7 ≥ 4 · ≥ 7 everything).
5. Spine: order ≥ 7 segments merged into reaches when consecutive, same order and mean
   discharge within 25 % (`merge_chains`), then Douglas-Peucker 0.01° and 3-decimal coordinates.
6. `points.json`: midpoints of order ≥ 6 reaches, sorted by mean discharge, capped at 30 000
   (`RIVER_POINTS_LIMIT`).

## Sample mode

Natural Earth 50 m rivers (public domain) form the spine. Strahler order is approximated from
`scalerank`; mean discharge uses published long-term averages for ~200 named rivers and an
order-based estimate otherwise; flow direction is inferred (mouth = end nearest the coast or a
larger river). The manifest carries notes `rivers.sampleGeometry` / `rivers.sampleDischarge`
so the UI labels the layer as sample data.

## Attribution (mandatory)

"River network: HydroRIVERS (HydroSHEDS), Lehner, B., Grill G. (2013): Global river hydrography
and network routing: baseline data and new approaches to study the world's large river systems.
Hydrological Processes, 27(15): 2171–2186. https://www.hydrosheds.org"

## Known issues

- tippecanoe is Linux/macOS only; on Windows the network PMTiles step is skipped
  (`rivers.noNetworkTiles`), the spine still renders.
- Braided channels can produce multiple parallel reaches with the same name.
