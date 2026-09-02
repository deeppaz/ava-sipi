# reservoirs_gww

| | |
|---|---|
| Source | Global Water Watch (Deltares · WRI · WWF) — satellite-derived surface water area |
| Base | `https://api.globalwaterwatch.earth` (Swagger at `/docs`, OpenAPI at `/openapi.json`) |
| Endpoints | `GET /reservoir?skip&limit` (FeatureCollection, MultiPolygon, props `name`, `name_en`, `grand_id`, `source_name`, `source_id`) · `POST /reservoir/geometry` (GeoJSON body → intersecting reservoirs) · `GET /reservoir/{id}/ts/surface_water_area_monthly?start&stop` (`[{t, value(m²), name, unit}]`) |
| Format | JSON |
| Refresh | weekly (`ingest-weekly.yml`) |
| Auth | none (verified 2026-09-02: no security schemes in OpenAPI) |
| Output | `reservoirs/<version>/latest.json` (`ReservoirsLatest`) + `series/<id>.json` (`ReservoirSeries`) |

## Method

- v1 scope: reservoirs with a `grand_id` (GRanD large dams). Sample mode: 25 well-known
  reservoirs located with `POST /reservoir/geometry`.
- `fillPct = area_now / p95(area, last 3 years) × 100` — **a surface-area proxy**, not a volume
  measurement; the UI states this (`note.reservoirs.proxy`).
- `trend90d` = fillPct now − fillPct at the observation ≥ 90 days earlier.
- GRanD capacity (`capacityMcm`) is joined when the GRanD v1.3 CSV is available at
  `ingest/tests/fixtures/grand_dams.csv` (download requires accepting GRanD terms; not vendored).

## Attribution

"Reservoir surface area: Global Water Watch (Deltares, WRI, WWF), CC BY 4.0. Dam metadata:
Global Reservoir and Dam Database (GRanD) v1.3."

## Known issues

- `GET /ts` (batch) returned HTTP 500 during verification; the per-reservoir endpoint is used.
- Monthly aggregates can be missing in cloudy months; p95 uses whatever exists in the window.
