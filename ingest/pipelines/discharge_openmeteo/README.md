# discharge_openmeteo

| | |
|---|---|
| Source | Open-Meteo Flood API — Copernicus GloFAS v4 (ECMWF) river discharge, ~5 km grid |
| Endpoint | `GET https://flood-api.open-meteo.com/v1/flood?latitude=a,b,c&longitude=x,y,z&daily=river_discharge&past_days=30&forecast_days=7` |
| Docs | https://open-meteo.com/en/docs/flood-api |
| Format | JSON (array of results when several coordinates are passed) |
| Units | `river_discharge` in m³/s (`daily_units`) |
| Refresh | daily 03:30 UTC (`ingest-daily.yml`) |
| Auth | none for non-commercial use; `apikey` for commercial (`OPEN_METEO_API_KEY`) |
| Rate limit | free tier: 10,000 calls/day, 600/min — 100 points per call → ~250 calls for 25k points |
| Output | `discharge/<version>/YYYYMMDD.parquet` (`id`, `ratio`, `today`, `forecast[7]`, `lat`, `lon`), plus a JSON twin ≤ 5k records |

## Method

`ratio = today / DIS_AV_CMS` where `today` is the latest past day with a value (GloFAS lags
about one day) and `DIS_AV_CMS` is the HydroRIVERS long-term mean at the segment. Ratios are
capped at 12. The web app joins by segment `id` and drives river colour + flow speed from it.

Points: midpoints of HydroRIVERS segments with `ORD_STRA ≥ 6` (~25k, see rivers pipeline).
Sample mode uses the first 600 spine points.

## Attribution

"River discharge: Open-Meteo.com (CC BY 4.0), based on Copernicus GloFAS (ECMWF)."

## Known issues

- GloFAS grid cells may not align with narrow rivers; `cell_selection` defaults to nearest.
- Historical data is available only from 1984 to mid-2022 plus the rolling forecast window,
  so the time slider for rivers uses our own archived daily parquet files.
