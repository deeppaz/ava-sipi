import { useEffect } from 'react'
import { useI18n } from '@/i18n'
import { forecastDays, useApp } from '@/state/store'

export function HoverTooltip() {
  const hover = useApp((s) => s.hover)
  if (!hover) return null
  return (
    <div className="tooltip glass" style={{ left: hover.x + 12, top: hover.y + 12 }} role="status">
      <div className="tooltip__title">{hover.title}</div>
      {hover.subtitle ? <div className="text-secondary num">{hover.subtitle}</div> : null}
    </div>
  )
}

export function ForecastWatermark() {
  const { t } = useI18n()
  const time = useApp((s) => s.time)
  if (time.mode !== 'forecast') return null
  return (
    <div className="watermark" aria-hidden="true">
      {t('time.forecast', { days: forecastDays(time) })}
    </div>
  )
}

export function Toast() {
  const toast = useApp((s) => s.toast)
  const showToast = useApp((s) => s.showToast)
  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => showToast(null), 2400)
    return () => window.clearTimeout(id)
  }, [toast, showToast])
  if (!toast) return null
  return (
    <output className="toast glass fade-in" aria-live="polite">
      {toast}
    </output>
  )
}

export function PerfNotice() {
  const { t } = useI18n()
  const level = useApp((s) => s.perfLevel)
  if (level === 0) return null
  return (
    <div className="visually-hidden" aria-live="polite">
      {t('a11y.fps')}
    </div>
  )
}
