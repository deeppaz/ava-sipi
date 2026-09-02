import type { Quantity } from './units'

const numberFormatters = new Map<string, Intl.NumberFormat>()

function nf(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let f = numberFormatters.get(key)
  if (!f) {
    f = new Intl.NumberFormat(locale, options)
    numberFormatters.set(key, f)
  }
  return f
}

/** Significant-digit aware: 0.35 → "0.35", 12.4 → "12.4", 1234 → "1,234", 209000 → "209,000". */
export function formatNumber(locale: string, value: number, maxFraction?: number): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  const digits = maxFraction ?? (abs >= 100 ? 0 : abs >= 10 ? 1 : 2)
  return nf(locale, { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(value)
}

export function formatQuantity(locale: string, q: Quantity, maxFraction?: number): string {
  return `${formatNumber(locale, q.value, maxFraction)} ${q.unit}`
}

export function formatCompact(locale: string, value: number): string {
  if (!Number.isFinite(value)) return '—'
  return nf(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

export function formatPercent(locale: string, value: number, maxFraction = 0): string {
  return `${formatNumber(locale, value, maxFraction)} %`
}

export function formatSigned(locale: string, value: number, maxFraction = 1): string {
  const s = formatNumber(locale, Math.abs(value), maxFraction)
  return value > 0 ? `+${s}` : value < 0 ? `−${s}` : s
}

export function formatDate(locale: string, iso: string, style: 'short' | 'long' = 'short'): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat(locale, {
    dateStyle: style === 'long' ? 'long' : 'medium',
    timeZone: 'UTC',
  }).format(d)
}

export function formatDateTime(locale: string, iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(d)} UTC`
}

export function formatTimeOnly(locale: string, iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: 'UTC' }).format(d)
}

/** "4 min ago", "2 h ago", "3 d ago" — via Intl.RelativeTimeFormat. */
export function formatAgo(locale: string, iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const diffSec = Math.round((t - now) / 1000)
  const abs = Math.abs(diffSec)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'narrow' })
  if (abs < 60) return rtf.format(Math.round(diffSec), 'second')
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour')
  if (abs < 86400 * 60) return rtf.format(Math.round(diffSec / 86400), 'day')
  if (abs < 86400 * 365 * 2) return rtf.format(Math.round(diffSec / (86400 * 30.44)), 'month')
  return rtf.format(Math.round(diffSec / (86400 * 365.25)), 'year')
}

export function minutesSince(iso: string, now: number = Date.now()): number {
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? Number.NaN : Math.max(0, Math.round((now - t) / 60000))
}

export function toISODay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return toISODay(d)
}

export function addMonths(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + n)
  return toISODay(d)
}

export function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000,
  )
}
