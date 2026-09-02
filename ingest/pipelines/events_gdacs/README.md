# events_gdacs

| | |
|---|---|
| Source | GDACS — Global Disaster Alert and Coordination System (EC JRC + UN OCHA) |
| Endpoint | `GET https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=FL&alertlevel=Green;Orange;Red&fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD&pagesize=200` (one call per type FL / DR / TC) |
| Polygons | `url.geometry` per event → `…/api/polygons/getgeometry?eventtype=FL&eventid=…&episodeid=…` (FeatureCollection with `Class` = `Point_Centroid`, `Poly_Affected`, `Poly_Global`, TC wind buffers `Poly_Green/Orange/Red`) |
| Population | `https://www.gdacs.org/xml/rss.xml` → `gdacs:population` (SEARCH JSON has no population field) |
| Format | GeoJSON |
| Refresh | every 15 min (`ingest-live.yml`) |
| Auth | none |
| Latency | GDACS updates floods (GloFAS) daily, cyclones every 6 h |
| Output | `events/<version>/current.geojson` — `WaterEventCollection` |

## Field mapping

| GDACS | Ava Sipî |
|---|---|
| `eventtype` FL / DR / TC | `type` flood / drought / cyclone |
| `alertlevel` Green / Orange / Red | `severity` |
| `name` | `title` |
| `fromdate` (UTC, no suffix) | `startedAt` (Z appended) |
| `datemodified` | `updatedAt` |
| `url.report` | `sourceUrl` |
| `severitydata.severitytext` | `severityText` |
| RSS `gdacs:population` | `affectedPopulation` |

Polygons are fetched only for orange/red events (bounded runtime), decimated to ≤ 600 vertices,
coordinates rounded to 3 decimals (~100 m). Green events stay points.

## Attribution (mandatory)

"Event data: GDACS (Global Disaster Alert and Coordination System), a cooperation framework
between the United Nations and the European Commission. https://www.gdacs.org"

## Known issues

- `pagesize` caps at 100 in practice; the pipeline queries per event type to stay under it.
- Drought events (`DR`) are points with an affected-area magnitude; polygons are rarely published.
- Timestamps carry no timezone; GDACS documents them as UTC.
