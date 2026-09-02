# groundwater_grace

| | |
|---|---|
| Primary | NASA JPL GRACE/GRACE-FO Mascon RL06.3 CRI v4 — `TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4`, DOI 10.5067/TEMSC-3JC634, NetCDF-4, 0.5°, monthly since 2002-04, variable `lwe_thickness` (cm water equivalent) with `scale_factor` (CRI) and `land_mask` |
| Discovery | CMR `https://cmr.earthdata.nasa.gov/search/granules.json?short_name=…&sort_key=-start_date&page_size=1` (no auth) → `archive.podaac.earthdata.nasa.gov/podaac-ops-cumulus-protected/…/*.nc` |
| Auth | Earthdata Login (free) — `EARTHDATA_USERNAME` / `EARTHDATA_PASSWORD`; handled by `earthdata.py` |
| Fallback | NASA GRACE-DA global groundwater-storage percentile, UNL: `https://nasagrace.unl.edu/globaldata/<YYYYMMDD>/gws_perc_025deg_GL.tif` (float32 1440×600, lon −180…180, lat 90…−60, nodata −999, weekly, **no login**) |
| Refresh | monthly (`ingest-monthly.yml`) — fallback can run weekly |
| Outputs | `groundwater/<version>/tws_YYYYMM.pmtiles` (per month, z0–z4), `tws_latest.png/.pmtiles`, `tws_mean24.*`, `tws_trend.*` (cm/yr, last 10 yrs), `series/b<lat>_<lon>.json` (1° cell series in 5° blocks) · fallback: `gws_percentile.png/.pmtiles` |

## Colour

−20 cm deep ochre → 0 transparent → +20 cm cyan (OKLCH interpolation, spec §5.3). Percentile
fallback: 0 ochre → 50 transparent → 100 cyan.

## Behaviour without login

The pipeline never fabricates history: with no Earthdata credentials it publishes the
open weekly percentile snapshot, sets `stale: true` (the layer is a different, shorter-memory
indicator) and the note `groundwater.percentileFallback`; the time slider is disabled for the
layer and the panel says "no series available".

## Attribution

"Groundwater / total water storage: NASA JPL GRACE & GRACE-FO Mascon RL06.3 (Watkins et al.
2015; Wiese et al. 2016), https://grace.jpl.nasa.gov. Percentile indicators: NASA GSFC & the
National Drought Mitigation Center, University of Nebraska–Lincoln, https://nasagrace.unl.edu"

## Known issues

- Mascon fields have ~3° effective resolution; tiles stop at z4 on purpose.
- GRACE ↔ GRACE-FO gap (mid-2017 → mid-2018): months are simply absent.
- UNL serves no `.tfw`; georeferencing is hard-coded from the known grid.
