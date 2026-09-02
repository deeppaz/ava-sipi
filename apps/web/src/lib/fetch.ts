/** Fetch helpers: timeout, JSON parsing, typed errors, tiny in-memory cache. */

export class HttpError extends Error {
  constructor(
    public readonly url: string,
    public readonly status: number,
    message?: string,
  ) {
    super(message ?? `HTTP ${status} for ${url}`)
    this.name = 'HttpError'
  }
}

export interface FetchOptions {
  timeoutMs?: number | undefined
  signal?: AbortSignal | undefined
  headers?: Record<string, string> | undefined
  cache?: RequestCache | undefined
}

export async function fetchWithTimeout(url: string, opts: FetchOptions = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('timeout')), opts.timeoutMs ?? 15000)
  const onAbort = () => controller.abort(opts.signal?.reason)
  opts.signal?.addEventListener('abort', onAbort, { once: true })
  try {
    const init: RequestInit = { signal: controller.signal }
    if (opts.headers) init.headers = opts.headers
    if (opts.cache) init.cache = opts.cache
    const res = await fetch(url, init)
    if (!res.ok) throw new HttpError(url, res.status)
    return res
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onAbort)
  }
}

export async function fetchJson<T>(url: string, opts?: FetchOptions): Promise<T> {
  const res = await fetchWithTimeout(url, opts)
  return (await res.json()) as T
}

const memo = new Map<string, { at: number; promise: Promise<unknown> }>()

/** Dedupes concurrent calls and caches for `ttlMs`. */
export function fetchJsonCached<T>(url: string, ttlMs = 60_000, opts?: FetchOptions): Promise<T> {
  const hit = memo.get(url)
  const now = Date.now()
  if (hit && now - hit.at < ttlMs) return hit.promise as Promise<T>
  const promise = fetchJson<T>(url, opts).catch((e) => {
    memo.delete(url)
    throw e
  })
  memo.set(url, { at: now, promise })
  return promise
}

export function clearFetchCache(): void {
  memo.clear()
}

/** Resolve an artifact URL: absolute passes through, relative joins the data base. */
export function resolveUrl(url: string, base: string): string {
  if (/^(https?:)?\/\//.test(url) || url.startsWith('/')) return url
  return `${base.replace(/\/?$/, '/')}${url}`
}

export function dirnameUrl(url: string): string {
  const i = url.lastIndexOf('/')
  return i >= 0 ? url.slice(0, i + 1) : ''
}
