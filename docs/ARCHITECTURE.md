# Architecture

Static-first (spec §1.1): heavy processing runs in scheduled GitHub Actions and writes static
artifacts (PMTiles, GeoJSON, Parquet, PNG) plus JSON manifests. The browser reads them from a CDN.
Thin live layers go through an optional Cloudflare Worker. No server, no database.

```mermaid
flowchart LR
  subgraph sources[Open sources]
    HR[HydroRIVERS]
    USGS[USGS OGC API]
    NWPS[NOAA NWPS]
    OM[Open-Meteo Flood]
    GD[GDACS]
    GDO[Copernicus GDO WMS]
    GR[NASA GRACE / GRACE-DA]
    GWW[Global Water Watch]
    RGI[RGI 7 + WGMS]
  end
  subgraph ingest[ingest · GitHub Actions cron]
    P[pipelines/*  run(config) → LayerManifest]
    V[validate against packages/schema JSON Schema]
    T[tiles: tippecanoe · PMTiles writer]
  end
  sources --> P --> V --> T --> R2[(Cloudflare R2 · CDN)]
  R2 -->|manifest.json + artifacts| WEB
  subgraph WEB[apps/web · MapLibre globe + deck.gl]
    M[manifest loader]
    D[data store · parquet in Web Worker]
    L[layers: rivers · gauges · events · reservoirs (deck) · rasters · glaciers (MapLibre)]
    UI[shell: rail · search · panel · timeline · ⌘K · stories]
  end
  USGS & NWPS & OM & GWW -->|live series, CORS| WEB
  USGS & NWPS & OM & GWW -.->|optional| W[apps/worker edge proxy · cache 5–15 min · stale fallback]
  W --> WEB
```

## Packages

| Path | Role |
|---|---|
| `packages/schema` | Zod contracts; `pnpm schema:export` writes JSON Schema used by Python. |
| `packages/layers` | One manifest per layer: colour token, legend, LOD table, time support, attribution. Adding a layer starts here (`docs/ADDING_A_LAYER.md`). |
| `packages/ui` | Glass primitives (button, switch, tooltip, sheet, kbd). |
| `apps/web` | Vite + React 19. `map/` (MapLibre, camera, basemap style), `layers/` (deck builders + native layers), `panels/`, `state/` (zustand + URL), `lib/`, `i18n/` (en/tr/ku), `stories/`. |
| `apps/worker` | Cloudflare Worker: `/api/live/{usgs,noaa,gdacs,openmeteo,gww}/*`. |
| `ingest` | Python 3.12 (uv). `common/` framework, `pipelines/<source>/run.py`, `tests/` with fixtures. |
| `data/manifests` | Generated layer manifests + `manifest.json` (committed). |
| `data/samples` | Small real artifacts for offline development (served at `/data` by Vite). |

## Data flow in the browser

1. `useManifest.load()` fetches `VITE_MANIFEST_URL` or falls back to `/data/manifests/manifest.json`
   (sample mode). Artifact URLs resolve relative to the manifest's directory.
2. Turning a layer on calls `useData.ensure(layer, manifest, base, time)`; the loader picks the
   artifact by `name` (`spine`, `latest`, `current`, …). In *past* mode the version segment of the
   URL is swapped for the newest archived version ≤ the chosen day (`manifest.versions`).
3. Discharge parquet is parsed in a Web Worker (hyparquet, HTTP range requests); a JSON twin is the
   fallback. Rivers join `ratio` by segment id in the accessor; forecast days use `forecast[n-1]`.
4. deck.gl layers are rebuilt per frame only while something animates (`needsAnimation`); otherwise
   only when store/data change. Uniform-level animation (radiusScale, opacity, shader time) keeps
   per-frame cost at a props diff.
5. MapLibre-native layers (rasters, glaciers) are synced in an effect and re-added after a style
   swap (offline basemap fallback).

## Scheduled runs are stateless

Every cron run starts from an empty checkout, so `ingest/restore.py` first pulls the artifacts that
slower pipelines published (`gauges/latest/{stations.parquet,stats.json,noaa.json}`,
`rivers/latest/points.json`) out of R2 into the working directory. Without it the 15-minute gauge
job would silently lose station names, percentiles and flood categories, and the daily discharge
job would have no river points. A 404 is not an error — it just means that pipeline has not run yet,
and the layer reports the gap through a manifest note.

## Manifest notes are owned

Several pipelines write one layer (`discharge_openmeteo` and `rivers` both write `rivers`). When a
pipeline runs, `cli.py` keeps the sibling's artifacts and notes, but drops any previous note listed
in the running pipeline's `OWNED_NOTES` — the run that just happened is authoritative for those.

## Performance

- Bundle budget enforced by `apps/web/scripts/budget.mjs` (initial JS ≤ 450 KB gzip; ≈ 108 KB in
  practice). `index.html` paints a static globe skeleton; the MapLibre module loads on idle after
  the shell renders, deck.gl after the globe's first paint, panels on first use.
- `lib/fps.ts` measures the rAF delta average; < 45 fps for 3 s raises `perfLevel` (rivers LOD one
  step up, gauge clustering threshold up, frame cap 30 fps at level 2).
- PMTiles via HTTP range requests (`pmtiles` protocol); never a full download.

## Worker rate limiting

Fixed window per client IP in isolate memory (`RateLimiter`). For exact global limits use a KV
counter or a Durable Object per IP; the interface (`hit(key, limit)`) is the only thing to swap.

## Versioning & releases

Changesets (`pnpm changeset`), semver, `CHANGELOG.md`. Artifacts are versioned by
`YYYYMMDDTHHMM`; `latest/` aliases point at the newest.
