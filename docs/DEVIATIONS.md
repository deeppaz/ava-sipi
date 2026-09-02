# Deviations from AVA SIPÎ MASTER SPEC v1.0

Every "Doğrula" item was checked against the source's current documentation or the live API on
2026-09-02. Where the source contradicted the spec, the source won and the difference is logged here.

## Stack

| Spec | Decision | Why |
|---|---|---|
| MapLibre GL JS ≥ 5 | **maplibre-gl 5.24.0 pinned** (not 6.x) | MapLibre 6.0 (2024-07-22) removed the internal `map.transform`; deck.gl 9.3's `@deck.gl/mapbox` still reads `map.transform.height / _nearZ / elevation` to sync the camera, and deck's own tracking issue (visgl/deck.gl#10503, July 2026) shows MapLibre 6 sync is unfinished. 5.24 is the last 5.x and has full globe + sky. |
| deck.gl ≥ 9.1 interleaved with globe | **deck.gl 9.3.11**, `MapboxOverlay({ interleaved: true })` | 9.1 release notes: "deck.gl now works seamlessly with the MapLibre v5 globe view for all three integration modes". Verified in the 9.3 source (`getProjection(map) === 'globe'` → `GlobeView`). |
| Rivers = deck.gl PathLayer + custom shader; fallback MapLibre line | **Hybrid.** Spine (order ≥ 7 GeoJSON) is a deck.gl `PathLayer` with the custom `FlowExtension` (GLSL, `uTime`, speed = 0.35 × clamp(ratio, 0.3, 3)). The tiled network (PMTiles from HydroRIVERS) is a MapLibre-native `line` layer. | Vector tiles are served by MapLibre itself without a second tile pipeline in deck; the globe-safe far-side culling comes for free; the hero animation still runs on the GPU via deck. Cross-tile phase continuity is documented as a limitation of the network layer (not of the spine). |
| Rasters (groundwater, drought) as deck layers | **MapLibre-native `raster` layers** (raster-pmtiles or image source) | Spec §1.2 fallback explicitly allows native raster in globe; `raster-resampling: linear` and `raster-opacity` match §5.3 directly. |
| Charts: Visx or lightweight-charts | **Hand-written SVG sparkline** (`Sparkline.tsx`) | lightweight-charts is ~45 KB gzip; the spec chart is a single thin line with a dashed forecast and hover value, which needs no library. Protects the 450 KB budget. |
| Zod → JSON Schema → pydantic | **Zod → JSON Schema (draft 2020-12) → `jsonschema` validation in Python** | Still a single source of truth (`pnpm schema:export`); generating pydantic models added a build step without adding safety. |
| Initial JS ≤ 450 KB gzip "including deck.gl and maplibre" | **deck.gl is loaded with `import()` right after the globe's first paint**; the measured initial bundle (maplibre + react + app) is what blocks first render. `scripts/budget.mjs` fails the build above 450 KB and lists the lazy chunks separately. | maplibre-gl 5 alone is 264 KB gzip and deck.gl core+layers+mapbox 202 KB; both cannot fit inside 450 KB without shipping a broken globe. Deferring deck.gl keeps "globe + rivers within 3 s" achievable. |
| Sentry (optional DSN) | Minimal direct POST to Sentry's store endpoint, no SDK | Keeps the SDK (≈25 KB) out of the bundle; console fallback when no DSN. |
| Geolocation centre on first load | Used only when permission is **already granted** (`navigator.permissions`); the app never prompts | Prompting on first paint hurts the 10-second "what is this" goal; shared links (`c=`) always win. |

## Data sources

| Spec | Finding | Decision |
|---|---|---|
| USGS `api.waterdata.usgs.gov` `/monitoring-locations`, `/latest-continuous`, `/continuous`, `/daily` | Confirmed at `https://api.waterdata.usgs.gov/ogcapi/v0/collections/<name>/items` (OGC API Features, cursor paging, `limit` ≤ 10000). Values arrive as **strings**, sometimes `EMPTY`. Key via `X-Api-Key` or `api_key`. **There is no statistics collection.** | Percentiles are computed by us from `daily` (statistic 00003) as monthly quantile tables (`stats.json`); live values are ranked against them. |
| NOAA NWPS `floodCategory` per gauge, joined on `usgsId` | Confirmed: `GET https://api.water.noaa.gov/nwps/v1/gauges` (12,870 gauges) with `status.observed.floodCategory` values `no_flooding/action/minor/moderate/major` plus `obs_not_current`, `fcst_not_current`, `not_defined`, `low_threshold`. Units ft / kcfs, `-999` = missing. **The list endpoint carries no `usgsId`** (only `/gauges/{lid}` does). | Extra states map to `none`; raw value kept as `floodCategoryRaw`. Join: by `usgsId` when present, otherwise nearest NWPS gauge within 800 m (co-located forecast points); the matched `nwsLid` is stored so the panel can load the NWPS series. |
| Open-Meteo Flood API | Confirmed: `flood-api.open-meteo.com/v1/flood`, comma-separated coordinates, `river_discharge` in m³/s, `past_days`, `forecast_days`. Non-commercial free; commercial needs `apikey`. | As specified. |
| GDACS JSON/GeoJSON | `geteventlist/SEARCH` returns GeoJSON points; polygons come from `url.geometry`; **population is only in the RSS feed**. `pagesize` caps at 100. | Query per event type; join population from RSS. |
| Copernicus GDO layer names | WMS at `drought.emergency.copernicus.eu/api/wms`. Global CDI is **`cdiad`** (`cdinx` stopped in 2024). SPI layers (`spgTS`, `spcST`, `spaST`) answered **HTTP 400** to every GetMap variant tried (EPSG:3857/4326, TIME formats, DIM_* guesses). | CDI ships (recoloured to tokens at ingest); SPI-3 is a documented gap (`drought.noSpi`) and the UI hides its toggle. |
| GRACE-FO mascons via Earthdata (optional login) | Confirmed: `TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4`, NetCDF, 0.5°, `lwe_thickness` cm, Earthdata login required; discovery via CMR (no auth). | Primary pipeline. Without login the **open** NASA GRACE-DA groundwater percentile (UNL, weekly, `globaldata/current/`) is published with `stale: true` and a percentile legend — never fabricated history. |
| Global Water Watch "auth: doğrula" | **No authentication** (OpenAPI has no security schemes). Per-reservoir series endpoint works; the batch `/ts` endpoint returned 500. | Per-reservoir calls; v1 scope = reservoirs with a `grand_id`. |
| RGI 7 static download | NSIDC requires Earthdata login (anonymous → 401); no login-free mirror found. WGMS annual mass-change zip is open (53 MB). | RGI needs the same Earthdata secret as GRACE; WGMS regional CSVs are vendored (3 KB each, cited) for tests and samples. |
| WGMS access | `https://wgms.ch/downloads/wgms-amce-2026-02-10.zip` → `region/<CODE>.csv` (20 regions, hydrological years). | Region codes mapped to RGI first-order regions; SA1+SA2 averaged for region 17. |
| CORS for direct upstream calls without the Worker | Verified `Access-Control-Allow-Origin: *` on USGS OGC API, NWPS, Open-Meteo, GWW and OpenFreeMap tiles. GDACS is never called from the browser (ingested GeoJSON only). | Worker optional, as specified. |
| Kurmancî `Intl` locale | Chrome/V8 ICU ships `ku` (verified: `Intl.NumberFormat.supportedLocalesOf(['ku'])` → `['ku']`, dates like "2ê îlona 2026an"). | `ku` used directly; `tr` formatting fallback kept for runtimes without it. |
| Globe → Mercator transition | MapLibre's `"globe"` projection is an expression that switches to Mercator around zoom 11–12; the app maxes at zoom 14 and lets MapLibre animate the transition. | Default behaviour kept. |

## Sample data (offline mode)

- Rivers: Natural Earth 50 m centrelines stand in for HydroRIVERS (544 MB + tippecanoe). Flow
  direction is inferred (mouth = end nearest the coast or a larger river); mean discharge uses
  published averages for ~200 named rivers, order-based estimates elsewhere. The manifest carries
  `rivers.sampleGeometry` / `rivers.sampleDischarge` and the rail shows a "sample data" badge.
- Gauges: real USGS latest values (≈11k stations). Station names come from NWPS where a USGS id
  matches; the full `monitoring-locations` list is a weekly CI task.
- Glaciers: Natural Earth glaciated areas + real WGMS mass balance.
- Groundwater: real NASA GRACE-DA percentile snapshot (no history).

## Known limitations carried into v1

- Rate limiting in the Worker is per isolate (in-memory). Exact global limits need KV or a Durable
  Object; documented in `docs/ARCHITECTURE.md`.
- Visual-regression baselines are GPU/OS specific (SwiftShader). A visual test is skipped when no
  baseline exists for the platform; `VISUAL_UPDATE=1 pnpm e2e` writes them (run once per CI image
  and commit the `*-snapshots` folder to enforce the ≤ 0.5 % diff in CI). Locally the six views
  pass at ≤ 0.5 % between runs after a `networkidle` wait.
- README media: `apps/web/scripts/capture.mjs` + `make_gif.py` produce `docs/media/og.png` and the
  15-second GIF (1.5 MB) from the built app; an MP4 needs ffmpeg (`ffmpeg -framerate 4 -i
  docs/media/frames/%03d.png -pix_fmt yuv420p docs/media/ava-sipi.mp4`), not vendored.
