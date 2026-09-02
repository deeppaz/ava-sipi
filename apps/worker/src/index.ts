/**
 * Ava Sipî edge proxy (spec §7).
 *
 * Routes:  /api/live/usgs/*  /api/live/noaa/*  /api/live/gdacs/*  /api/live/openmeteo/*  /api/live/gww/*
 * - adds upstream keys when configured (never exposed to the browser)
 * - caches in the Cache API for 5–15 min per source
 * - CORS for any origin (GET only)
 * - on upstream failure serves the last good response with `X-Ava-Stale: true`
 * - 60 requests / minute / IP (per isolate; see docs/ARCHITECTURE.md for the KV/DO upgrade)
 */
import { RateLimiter } from './ratelimit'
import { buildUpstreamUrl, resolveRoute, type Source } from './routes'

export interface Env {
  USGS_API_KEY?: string
  OPEN_METEO_API_KEY?: string
  ALLOWED_ORIGIN?: string
  RATE_LIMIT_PER_MINUTE?: string
}

const CACHE_TTL: Record<Source, number> = {
  usgs: 300,
  noaa: 300,
  gdacs: 900,
  openmeteo: 900,
  gww: 3600,
}
const STALE_TTL = 6 * 3600

const limiter = new RateLimiter()

function cors(origin: string | null, allowed: string | undefined): HeadersInit {
  const ok =
    !allowed ||
    allowed === '*' ||
    (origin !== null &&
      allowed
        .split(',')
        .map((s) => s.trim())
        .includes(origin))
  return {
    'Access-Control-Allow-Origin': ok
      ? allowed && allowed !== '*'
        ? (origin ?? '')
        : '*'
      : 'null',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(body: unknown, status: number, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function withHeaders(res: Response, extra: HeadersInit): Response {
  const out = new Response(res.body, res)
  for (const [k, v] of Object.entries(extra)) out.headers.set(k, v as string)
  return out
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const origin = request.headers.get('Origin')
    const corsHeaders = cors(origin, env.ALLOWED_ORIGIN)

    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: corsHeaders })
    if (url.pathname === '/health')
      return json({ ok: true, ts: new Date().toISOString() }, 200, corsHeaders)
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return json({ error: 'method not allowed' }, 405, corsHeaders)

    const route = resolveRoute(url.pathname)
    if (!route) return json({ error: 'not found' }, 404, corsHeaders)

    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
    const limit = Number(env.RATE_LIMIT_PER_MINUTE ?? 60)
    const rl = limiter.hit(ip, limit)
    if (!rl.allowed) {
      return json({ error: 'rate limited' }, 429, {
        ...corsHeaders,
        'Retry-After': String(rl.retryAfterSeconds),
        'X-RateLimit-Limit': String(limit),
      })
    }

    const upstream = buildUpstreamUrl(route, url.searchParams)
    const headers = new Headers({
      Accept: 'application/json',
      'User-Agent': 'ava-sipi-worker/0.1 (+https://github.com/ava-sipi/ava-sipi)',
    })
    if (route.source === 'usgs' && env.USGS_API_KEY) headers.set('X-Api-Key', env.USGS_API_KEY)
    if (route.source === 'openmeteo' && env.OPEN_METEO_API_KEY)
      upstream.searchParams.set('apikey', env.OPEN_METEO_API_KEY)

    const cache = caches.default
    // Cache key excludes credentials; it's the public upstream URL (minus any apikey).
    const keyUrl = new URL(upstream.toString())
    keyUrl.searchParams.delete('apikey')
    const cacheKey = new Request(keyUrl.toString(), { method: 'GET' })
    const staleKey = new Request(`${keyUrl.toString()}#stale`, { method: 'GET' })

    const cached = await cache.match(cacheKey)
    if (cached) return withHeaders(cached, { ...corsHeaders, 'X-Ava-Cache': 'hit' })

    const ttl = CACHE_TTL[route.source]
    try {
      const res = await fetch(upstream.toString(), { headers, cf: { cacheTtl: 0 } })
      if (!res.ok) throw new Error(`upstream ${res.status}`)
      const body = await res.arrayBuffer()
      const fresh = new Response(body, {
        status: 200,
        headers: {
          'Content-Type': res.headers.get('Content-Type') ?? 'application/json',
          'Cache-Control': `public, max-age=${ttl}`,
          'X-Ava-Upstream': route.source,
          'X-Ava-Fetched-At': new Date().toISOString(),
        },
      })
      const stale = new Response(body, {
        status: 200,
        headers: {
          ...Object.fromEntries(fresh.headers),
          'Cache-Control': `public, max-age=${STALE_TTL}`,
        },
      })
      ctx.waitUntil(Promise.all([cache.put(cacheKey, fresh.clone()), cache.put(staleKey, stale)]))
      return withHeaders(fresh, { ...corsHeaders, 'X-Ava-Cache': 'miss' })
    } catch (e) {
      const stale = await cache.match(staleKey)
      if (stale)
        return withHeaders(stale, {
          ...corsHeaders,
          'X-Ava-Cache': 'stale',
          'X-Ava-Stale': 'true',
          'X-Ava-Error': String(e instanceof Error ? e.message : e),
        })
      return json(
        {
          error: 'upstream unavailable',
          detail: e instanceof Error ? e.message : String(e),
          stale: false,
        },
        502,
        corsHeaders,
      )
    }
  },
}
