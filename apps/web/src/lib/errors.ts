/**
 * Error reporting (spec §8): Sentry when a public DSN is configured, console otherwise.
 * We post a minimal event to Sentry's store endpoint directly, so no SDK enters the bundle.
 */
import { env } from './env'

interface SentryTarget {
  url: string
  key: string
}

function parseDsn(dsn: string): SentryTarget | null {
  try {
    const u = new URL(dsn)
    const projectId = u.pathname.replace(/^\//, '')
    if (!u.username || !projectId) return null
    return { url: `${u.protocol}//${u.host}/api/${projectId}/store/`, key: u.username }
  } catch {
    return null
  }
}

const target = env.sentryDsn ? parseDsn(env.sentryDsn) : null
let sent = 0

export function reportError(error: unknown, context?: Record<string, unknown>): void {
  const err = error instanceof Error ? error : new Error(String(error))
  console.error('[ava-sipi]', err, context ?? '')
  if (!target || sent >= 20) return
  sent += 1
  const payload = {
    event_id: crypto.randomUUID().replace(/-/g, ''),
    timestamp: new Date().toISOString(),
    platform: 'javascript',
    level: 'error',
    release: `ava-sipi-web@${__APP_VERSION__}`,
    exception: {
      values: [
        {
          type: err.name,
          value: err.message,
          stacktrace: err.stack
            ? { frames: [{ filename: 'stack', function: err.stack.slice(0, 2000) }] }
            : undefined,
        },
      ],
    },
    extra: context,
    request: { url: window.location.href },
  }
  void fetch(target.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${target.key}, sentry_client=ava-sipi/1`,
    },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {})
}

export function installGlobalErrorHandlers(): void {
  window.addEventListener('error', (e) =>
    reportError(e.error ?? e.message, { source: 'window.onerror' }),
  )
  window.addEventListener('unhandledrejection', (e) =>
    reportError(e.reason, { source: 'unhandledrejection' }),
  )
}
