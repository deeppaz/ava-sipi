# Data sources

Every layer's source, refresh, licence and latency. Endpoint-level detail lives in
`ingest/pipelines/<source>/README.md`. Attribution text is in `ATTRIBUTIONS.md`.

| Layer | Source | Endpoint / file | Refresh | Auth | Latency | Licence |
|---|---|---|---|---|---|---|
| rivers (geometry, mean flow) | HydroRIVERS v1.0 (HydroSHEDS) | `data.hydrosheds.org/file/HydroRIVERS/HydroRIVERS_v10_shp.zip` | yearly | none | static | HydroSHEDS licence (free, attribution) |
| rivers (today's flow ratio) | Open-Meteo Flood API (Copernicus GloFAS v4) | `flood-api.open-meteo.com/v1/flood` | daily 03:30 UTC | none (commercial: key) | ~1 day | CC BY 4.0 · GloFAS Copernicus licence |
| gauges (live) | USGS Water Data OGC API | `api.waterdata.usgs.gov/ogcapi/v0/collections/latest-continuous/items` | 15 min | optional key | 15–60 min | US public domain |
| gauges (names, stats) | USGS `monitoring-locations`, `daily` | same base | weekly / monthly | optional key | — | US public domain |
| gauges (flood category) | NOAA National Water Prediction Service | `api.water.noaa.gov/nwps/v1/gauges` | 15 min | none | 15 min | US public domain |
| events | GDACS (EC JRC / UN OCHA) | `gdacs.org/gdacsapi/api/events/geteventlist/SEARCH`, polygons, RSS | 15 min | none | hours | free with attribution |
| reservoirs | Global Water Watch (Deltares · WRI · WWF) | `api.globalwaterwatch.earth/reservoir/{id}/ts/surface_water_area_monthly` | weekly | none | ~1 month (monthly aggregate) | CC BY 4.0 |
| reservoirs (capacity) | GRanD v1.3 | CSV (manual download, terms) | yearly | none | static | GRanD terms |
| groundwater | NASA JPL GRACE/GRACE-FO Mascon RL06.3 CRI v4 | PO.DAAC via CMR + Earthdata | monthly | Earthdata login | 1–2 months | NASA open |
| groundwater (fallback) | NASA GRACE-DA groundwater percentile (GSFC / NDMC-UNL) | `nasagrace.unl.edu/globaldata/current/gws_perc_025deg_GL.tif` | weekly | none | ~1 week | NASA open |
| drought | Copernicus EMS Global Drought Observatory | WMS `drought.emergency.copernicus.eu/api/wms` layer `cdiad` | 10-daily | none | ~10 days | Copernicus open |
| glaciers (outlines) | RGI 7.0 (GLIMS / NSIDC) | NSIDC regional zips | yearly | Earthdata login | static | CC BY 4.0 |
| glaciers (mass balance) | WGMS annual mass-change estimates 2026 | `wgms.ch/downloads/wgms-amce-2026-02-10.zip` | yearly | none | ~1 year | open with citation |
| basemap | OpenFreeMap (OpenMapTiles / OpenStreetMap) | `tiles.openfreemap.org/planet` | — | none | — | ODbL (OSM) |
| basemap (offline) | Natural Earth 1:110m | `data/samples/basemap/*.geojson` | — | none | — | public domain |
| snow (v1.5) | NASA MODIS snow cover (NSIDC) | — | daily | optional | — | NASA open |
| tides (v1.5) | NOAA CO-OPS | `api.tidesandcurrents.noaa.gov` | 6 min | none | 6 min | US public domain |

Rules (spec §2.1): every pipeline records its last successful run in the manifest
(`generatedAt`, `sourceUpdatedAt`); three consecutive failures show a "temporarily old data" badge
without hiding the layer; units are SI internally and converted only in the UI.
