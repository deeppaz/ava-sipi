# Deploying Ava Sipî

Nothing here is required to run the app: `pnpm i && pnpm dev` works offline from `data/samples`.
This document is for putting a live, self-updating instance on the internet. Everything below fits
in Cloudflare's free tier. A custom domain is optional throughout.

Three independent pieces:

| Piece | What it does | Needed for |
|---|---|---|
| **Pages** | serves the built web app | a public URL |
| **R2** | stores ingest artifacts + `manifest.json` | live data instead of the bundled sample |
| **Worker** | caches live APIs, hides keys | optional; the app calls CORS-enabled upstreams directly without it |

## 1. Account ID

Open https://dash.cloudflare.com. The account id is the 32-character hex string in the address bar
right after `dash.cloudflare.com/`, and is also shown under **Manage account → Account details**.

## 2. API token

https://dash.cloudflare.com/profile/api-tokens → **Create Token → Create Custom Token**.

| Scope | Permission |
|---|---|
| Account · Cloudflare Pages | Edit |
| Account · Workers Scripts | Edit (only if you deploy the Worker) |
| Account · Workers R2 Storage | Edit (only if the ingest writes to R2) |
| Zone · Cache Purge | Purge (only with a custom domain) |

Copy the token once; it is not shown again.

## 3. R2 bucket

**Storage & databases → R2 → Create bucket**, name `ava-sipi`, location Automatic.

- **Settings → Public access → R2.dev subdomain → Allow Access.** You get
  `https://pub-<hash>.r2.dev` — this is `R2_PUBLIC_URL`. (`r2.dev` is rate-limited and meant for
  development; attach a custom domain when traffic grows.)
- **Settings → CORS policy → Add CORS policy** and paste `infra/r2-cors.json` from this repo,
  replacing the origin with your Pages URL. Without it the browser cannot read the manifest, and
  PMTiles range requests fail.

### R2 S3 credentials (for the ingest)

**R2 → API → Manage API tokens → Create API token**, Object Read & Write, scoped to the `ava-sipi`
bucket. You get an **Access Key ID** and a **Secret Access Key** — these are `R2_ACCESS_KEY_ID` and
`R2_SECRET_ACCESS_KEY`. `R2_ACCOUNT_ID` is the same account id from step 1.

## 4. GitHub secrets and variables

Secrets never appear in the bundle (spec §8). Set them from the repo root — the values are read
from a prompt, so they stay out of your shell history:

```bash
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID
gh secret set R2_ACCOUNT_ID
gh secret set R2_ACCESS_KEY_ID
gh secret set R2_SECRET_ACCESS_KEY
gh secret set R2_BUCKET          # ava-sipi
gh secret set R2_PUBLIC_URL      # https://pub-<hash>.r2.dev

# public build-time configuration
gh variable set VITE_MANIFEST_URL --body "https://pub-<hash>.r2.dev/manifest.json"
```

Optional:

```bash
gh secret set USGS_API_KEY        # raises the USGS rate limit (api.waterdata.usgs.gov/signup)
gh secret set EARTHDATA_USERNAME  # GRACE mascons + RGI 7 outlines
gh secret set EARTHDATA_PASSWORD
gh secret set CLOUDFLARE_ZONE_ID  # cache purge, custom domain only
gh variable set DEPLOY_WORKER --body true      # deploy the edge proxy
gh variable set VITE_WORKER_URL --body "https://ava-sipi-live.<subdomain>.workers.dev"
```

## 5. First deploy

`deploy.yml` runs on every push to `main`; trigger it now with:

```bash
gh workflow run deploy && gh run watch
```

It creates the Pages project on the first run and publishes to `https://ava-sipi.pages.dev`.
Without `CLOUDFLARE_API_TOKEN` the same job falls back to GitHub Pages (`gh-pages` branch), which
needs a **public** repository and Settings → Pages → Branch `gh-pages`.

## 6. First data run

The site shows the bundled sample until R2 has real artifacts. Fill it in order — rivers first,
because the discharge pipeline needs its `points.json`:

```bash
gh workflow run ingest-monthly   # rivers (tick "rebuild HydroRIVERS"), groundwater, glaciers
gh workflow run ingest-weekly    # USGS stations + percentile tables, reservoirs
gh workflow run ingest-daily     # river discharge, drought
gh workflow run ingest-live      # gauges + events (then every 15 min on its own)
```

Each run writes artifacts to R2, rewrites `manifest.json` last (atomic ordering) and commits the
manifests back to the repo. The site picks them up on the next load; the "sample data" badge
disappears.

## 7. Custom domain (optional)

Cloudflare → **Domains → Add a domain** (register or transfer DNS), then:

- Pages project → **Custom domains → Set up a domain** → `avasipi.example`.
- R2 bucket → **Settings → Custom domain** → `data.avasipi.example`; update `R2_PUBLIC_URL` and
  `VITE_MANIFEST_URL` to match, and set `CLOUDFLARE_ZONE_ID` so the ingest can purge the CDN cache.

## 8. Worker (optional)

```bash
cd apps/worker
pnpm exec wrangler login
pnpm exec wrangler secret put USGS_API_KEY
pnpm exec wrangler deploy
```

Then point the app at it with `VITE_WORKER_URL`. Without it the browser calls USGS, NOAA,
Open-Meteo and Global Water Watch directly — all four send `Access-Control-Allow-Origin: *`
(verified, see `docs/DEVIATIONS.md`).

## Costs

Free tier as of 2026: Pages 500 builds/month and unlimited static requests, R2 10 GB storage with
free egress, Workers 100k requests/day. Cloudflare is not the constraint — GitHub Actions is.

`ingest-live` runs every 15 minutes and takes 3-5 minutes, so it alone costs roughly 350 Actions
minutes per day. That is free on a **public** repository and far beyond the 2000 minutes/month a
private repository gets. On a private repo, change its cron to `0 * * * *` (hourly, ~120 min/day)
or `0 */3 * * *` and accept older gauge values; the UI already shows the age of every reading.
