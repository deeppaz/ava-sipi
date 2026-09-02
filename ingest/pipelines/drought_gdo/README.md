# drought_gdo

| | |
|---|---|
| Source | Copernicus Emergency Management Service — Global Drought Observatory (EC JRC) |
| Endpoint | WMS 1.1.1 `https://drought.emergency.copernicus.eu/api/wms` (GetCapabilities lists 21 layers; verified 2026-09-02) |
| Layers | `cdiad` Combined Drought Indicator v4.1 (TIME extent `2012-01-01/2026-06-11/P10D`) · `spgTS` SPI GPCC monthly (`1981-01-01/2026-06-01/P1M`) · also `twsan` GRACE TWS anomaly, `smian` soil moisture anomaly |
| Format | PNG via GetMap (`SRS=EPSG:3857`, world bbox, 4096²), TIME dimension |
| Refresh | every 10 days (`ingest-daily.yml` skips when the TIME extent end is unchanged) |
| Auth | none |
| Outputs | `drought/<version>/cdi.png` (2048² Mercator image, bbox ±85.05°) · `cdi.pmtiles` (raster z0–z5) · `spi3.*` when available |

## Colour mapping (ingest-time, spec §6.4)

GDO palette → tokens: yellow `(240,228,66)` watch → `#D9A45B`; orange `(230,159,0)` warning →
`#C8873A`; red `(220,5,12)` alert → `#7A4A1C`; lighter recovery variants keep the class at ~50 % alpha.
Everything else becomes transparent.

## Known issues

- **SPI:** every GetMap variant for `spgTS`/`spcST`/`spaST` returned HTTP 400 (with/without TIME,
  EPSG:3857 and 4326, several DIM_* guesses). The CDI product ships; the manifest carries
  `drought.noSpi` and the UI hides the SPI toggle. See docs/DEVIATIONS.md.
- `cdinx` (older CDI layer) stopped at 2024-01-01; `cdiad` is the maintained one.
- WMS output is a rendered classification, not the numeric raster; per-pixel "value" in the
  panel is the class, not an index value. Numeric GeoTIFFs are on the GDO download portal
  (`/tumbo/gdo/download/`) and are a follow-up.

## Attribution

"Drought indicators: European Commission, Joint Research Centre — Copernicus Emergency Management
Service, Global Drought Observatory (GDO). https://drought.emergency.copernicus.eu"
