# gauges_noaa

| | |
|---|---|
| Source | NOAA National Weather Service — National Water Prediction Service (NWPS) API v1 |
| Endpoint | `GET https://api.water.noaa.gov/nwps/v1/gauges` (all ~12,900 gauges, ~13 MB) |
| Per gauge | `GET /gauges/{lid}` (thresholds, metadata), `GET /gauges/{lid}/stageflow` (observed + forecast series) — used live by the web app through the Worker |
| Docs | https://api.water.noaa.gov/nwps/v1/docs/ (Swagger) |
| Format | JSON |
| Refresh | 15 min |
| Auth | none |
| Output | `gauges/<version>/noaa.json` |

## Fields used

`lid`, `usgsId`, `name`, `latitude`, `longitude`, `status.observed.{primary, primaryUnit, secondary, secondaryUnit, floodCategory, validTime}`, `status.forecast.{floodCategory, validTime}`.

Units: `primary` stage in ft → m; `secondary` flow in kcfs → m³/s. `-999` means missing.

`floodCategory` values seen: `no_flooding`, `action`, `minor`, `moderate`, `major`,
`obs_not_current`, `fcst_not_current`, `not_defined`, `low_threshold`. Only the first five map to
the `FloodCategory` contract; everything else becomes `none` (the raw value is kept as
`floodCategoryRaw`).

## Join

`gauges_usgs` joins on `usgsId` → `USGS-<usgsId>` and copies `floodCategory` + `nwsLid`.

## Known issues

- Some NWPS gauges have no USGS id (state/local networks); they are dropped in sample mode.
- `validTime` `0001-01-01T00:00:00Z` marks "no forecast".
