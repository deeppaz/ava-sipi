import { useId, useMemo, useState } from 'react'
import { useI18n } from '@/i18n'
import { formatDateTime, formatNumber } from '@/lib/format'
import type { SeriesPoint } from '@/lib/live'

export interface SparklineProps {
  points: SeriesPoint[]
  forecast?: SeriesPoint[]
  unit: string
  /** value transform for display (unit conversion) */
  convert?: (v: number) => number
  height?: number
  /** horizontal reference line (e.g. long-term mean) in raw units */
  reference?: number
  ariaLabel: string
}

/**
 * Single-series line chart (spec §5.4): thin line, no area fill, dashed forecast, hover value.
 * Pure SVG — no charting dependency so the initial bundle stays inside the budget.
 */
export function Sparkline({
  points,
  forecast = [],
  unit,
  convert = (v) => v,
  height = 96,
  reference,
  ariaLabel,
}: SparklineProps) {
  const { locale } = useI18n()
  const id = useId()
  const [hover, setHover] = useState<number | null>(null)
  const width = 340
  const pad = { l: 4, r: 4, t: 8, b: 4 }

  const model = useMemo(() => {
    const all = [...points, ...forecast]
    if (all.length < 2) return null
    const xs = all.map((p) => new Date(p[0]).getTime())
    const ys = all.map((p) => convert(p[1]))
    const x0 = Math.min(...xs)
    const x1 = Math.max(...xs)
    const refY = reference === undefined ? undefined : convert(reference)
    const yAll = refY === undefined ? ys : [...ys, refY]
    let y0 = Math.min(...yAll)
    let y1 = Math.max(...yAll)
    if (y1 - y0 < 1e-9) {
      y0 -= 1
      y1 += 1
    }
    const sx = (x: number) => pad.l + ((x - x0) / Math.max(1, x1 - x0)) * (width - pad.l - pad.r)
    const sy = (y: number) => pad.t + (1 - (y - y0) / (y1 - y0)) * (height - pad.t - pad.b)
    const toPath = (pts: SeriesPoint[]) =>
      pts
        .map(
          (p, i) =>
            `${i === 0 ? 'M' : 'L'}${sx(new Date(p[0]).getTime()).toFixed(1)},${sy(convert(p[1])).toFixed(1)}`,
        )
        .join(' ')
    const obs = toPath(points)
    const last = points[points.length - 1]
    const fc = forecast.length ? toPath(last ? [last, ...forecast] : forecast) : ''
    return { all, xs, ys, sx, sy, obs, fc, refY, y0, y1 }
  }, [points, forecast, convert, reference, height])

  if (!model) return null
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * width
    let best = 0
    let bestD = Number.POSITIVE_INFINITY
    model.xs.forEach((x, i) => {
      const d = Math.abs(model.sx(x) - px)
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    setHover(best)
  }
  const h = hover !== null ? model.all[hover] : undefined
  const hx = hover !== null ? model.sx(model.xs[hover] as number) : 0
  const hy = hover !== null ? model.sy(model.ys[hover] as number) : 0
  const isForecast = hover !== null && hover >= points.length

  return (
    <div className="spark">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-labelledby={`${id}-label`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <title id={`${id}-label`}>{ariaLabel}</title>
        {model.refY !== undefined ? (
          <line
            x1={pad.l}
            x2={width - pad.r}
            y1={model.sy(model.refY)}
            y2={model.sy(model.refY)}
            stroke="var(--tide)"
            strokeDasharray="2 4"
            strokeWidth={1}
          />
        ) : null}
        <path
          d={model.obs}
          fill="none"
          stroke="var(--current)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
        {model.fc ? (
          <path
            d={model.fc}
            fill="none"
            stroke="var(--current)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {h ? (
          <g>
            <line
              x1={hx}
              x2={hx}
              y1={pad.t}
              y2={height - pad.b}
              stroke="var(--tide)"
              strokeWidth={1}
            />
            <circle
              cx={hx}
              cy={hy}
              r={3}
              fill={isForecast ? 'var(--abyss)' : 'var(--foam)'}
              stroke="var(--foam)"
              strokeWidth={1}
            />
          </g>
        ) : null}
      </svg>
      <div className="spark__readout num" aria-live="polite">
        {h ? (
          <>
            <span className="metric">{formatNumber(locale, convert(h[1]))}</span>{' '}
            <span className="text-secondary">{unit}</span>
            <span className="text-secondary"> · {formatDateTime(locale, h[0])}</span>
          </>
        ) : (
          <span className="text-secondary">
            {formatNumber(locale, model.y0)}–{formatNumber(locale, model.y1)} {unit}
          </span>
        )}
      </div>
    </div>
  )
}
