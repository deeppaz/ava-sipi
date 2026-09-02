# gauges_usgs

| | |
|---|---|
| Source | USGS Water Data for the Nation — OGC API (`api.waterdata.usgs.gov`, **not** the deprecated `waterservices.usgs.gov`) |
| Base | `https://api.waterdata.usgs.gov/ogcapi/v0/collections/` |
| Collections used | `latest-continuous`, `monitoring-locations`, `daily` |
| Docs | https://api.waterdata.usgs.gov/docs/ogcapi/ |
| Format | GeoJSON (OGC API Features), cursor pagination via `links[rel=next]`, `limit` ≤ 10000 |
| Auth | optional `X-Api-Key` (https://api.waterdata.usgs.gov/signup) — raises the rate limit; limits are returned in `X-RateLimit-Limit` / `X-RateLimit-Remaining` |
| Refresh | latest 15 min · stations weekly · stats monthly |

## Tasks (`USGS_TASK` env)

### `latest` (default)
`latest-continuous/items?f=json&limit=10000&parameter_code=00060` (discharge, `ft^3/s`) and
`parameter_code=00065` (gage height, `ft`). Each feature: `monitoring_location_id`
(`USGS-01646500`), `time`, `value` (string), `unit_of_measure`, `approval_status`, geometry Point.
Values older than 48 h or negative (ice/equipment sentinels) are dropped.
Output `gauges/<version>/latest.json` = `GaugesLatest` (SI: m³/s, m).

Percentile: the live discharge is ranked against the station's monthly quantile table from
`stats.json` (linear interpolation between p5…p95). Missing table → no `percentile`
(UI shows neutral colour and "no percentile").

Flood category + NWS lid are joined from `gauges/latest/noaa.json` (run `gauges_noaa` first).

### `stations`
`monitoring-locations/items?f=json&limit=10000&site_type_code=ST` (streams). Fields:
`monitoring_location_name`, `state_name`, `hydrologic_unit_code`, `drainage_area` (mi² → km²).
Output `stations.parquet` (snappy). River name is derived from the station name
("POTOMAC RIVER NEAR WASH" → "Potomac River").

### `stats`
For each station with a live discharge: `daily/items?monitoring_location_id=…&parameter_code=00060&statistic_id=00003&datetime=<10 years ago>/..`.
Per calendar month: [p5, p10, p25, p50, p75, p90, p95] of daily means (m³/s); months with < 60
daily values are `null`. Output `stats.json` = `GaugeStatsFile`.
Sample mode limits this to the 300 largest stations (`USGS_SAMPLE_STATS`).

## Attribution

"Streamflow data: U.S. Geological Survey, Water Data for the Nation, https://waterdata.usgs.gov (public domain)."

## Known issues

- `numberMatched` is not returned; iterate cursors until no `next` link.
- Some sites report discharge in units other than `ft^3/s` (e.g. tidal); they are skipped.
- No statistics collection exists in the OGC API, hence the client-side quantile tables.
