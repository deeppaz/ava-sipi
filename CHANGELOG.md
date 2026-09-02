# Changelog

All notable changes are recorded here. Versions follow semver via Changesets.

## 0.1.0 — 2026-09-03 · Wave 1 "Flowing Earth" + Wave 2 foundations

### Added
- Monorepo (pnpm + Turborepo), Biome, TypeScript strict, CI (lint, typecheck, unit, build, budget,
  Playwright smoke/visual, Lighthouse), deploy workflows (Cloudflare Pages / GitHub Pages, Worker).
- `packages/schema`: Zod contracts + JSON Schema export (single source for Python).
- `packages/layers`: manifests for rivers, gauges, events, reservoirs, groundwater, drought,
  glaciers (+ snow/tides placeholders).
- `apps/web`: MapLibre 5 globe with custom night basemap and atmosphere; deck.gl 9.3 interleaved;
  rivers with GPU flow animation (`FlowExtension`), gauges with percentile colours, clustering and
  flood pulses, GDACS events with polygons and severity pulses, reservoirs with fill/trend rings,
  MapLibre-native drought and groundwater rasters, glaciers with melt breathing; left rail, search,
  detail panel with live series (USGS / NWPS / Open-Meteo / GWW), timeline (history + 7-day
  forecast with watermark), ⌘K palette, four stories, i18n en/tr/ku, URL state, reduced motion,
  FPS-based density degradation, embed mode, screenshot/embed/share actions.
- `apps/worker`: Cloudflare edge proxy with cache, stale fallback, CORS and rate limiting.
- `ingest`: pipelines for HydroRIVERS, USGS (latest/stations/stats), NOAA NWPS, Open-Meteo,
  GDACS, Copernicus GDO, GRACE (mascons + GRACE-DA fallback), Global Water Watch, RGI/WGMS; own
  PMTiles v3 writer verified against the reference JS reader; fixtures + tests; sample generator.
- Docs: ARCHITECTURE, DATA_SOURCES, ADDING_A_LAYER, DEVIATIONS, DESIGN, STORIES; ATTRIBUTIONS.

### Known gaps
- SPI-3 from the GDO WMS (service returns 400) — CDI ships.
- RGI 7 / GRACE mascons need an Earthdata login in CI; without it samples/fallbacks are used.
