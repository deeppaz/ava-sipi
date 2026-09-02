# infra

`r2-cors.json` — CORS policy for the R2 bucket that serves the artifacts. Paste it into
**R2 → your bucket → Settings → CORS policy**, replacing the first origin with your own site.

`range` in `AllowedHeaders` and `content-range` / `accept-ranges` in `ExposeHeaders` are what make
PMTiles and Parquet HTTP range requests work in the browser; without them the globe falls back to
the bundled sample data. See `docs/DEPLOY.md`.
