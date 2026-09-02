import { layerById } from '@ava-sipi/layers'
import { Button } from '@ava-sipi/ui'
import { useMemo } from 'react'
import { Icons } from '@/design/icons'
import { useI18n } from '@/i18n'
import { addDays, addMonths, daysBetween, formatDate } from '@/lib/format'
import { forecastDays, type TimeState, todayUtc, useApp } from '@/state/store'

/**
 * Bottom timeline (spec §5.1): default live; dragging back loads archived artifacts, dragging
 * forward shows published forecasts. Domain comes from the active layers' time support.
 */
export function TimeSlider() {
  const { t, locale } = useI18n()
  const layers = useApp((s) => s.layers)
  const time = useApp((s) => s.time)
  const setTime = useApp((s) => s.setTime)
  const today = todayUtc()

  const domain = useMemo(() => {
    const active = layers.map((id) => layerById[id])
    const historyStarts = active.map((l) => l.time.historyFrom).filter((x): x is string => !!x)
    const start = historyStarts.length ? (historyStarts.sort()[0] ?? today) : addDays(today, -365)
    const forecast = Math.max(0, ...active.map((l) => l.time.forecastDays))
    const monthly =
      active.some((l) => l.id === 'groundwater') &&
      !active.some((l) => l.id === 'rivers' || l.id === 'gauges')
    return { start, forecast, monthly, hasHistory: historyStarts.length > 0 }
  }, [layers, today])

  const min = -daysBetween(domain.start, today)
  const max = domain.forecast
  const value = time.mode === 'live' ? 0 : daysBetween(today, time.day)

  const apply = (offset: number) => {
    const clamped = Math.max(min, Math.min(max, offset))
    let next: TimeState
    if (clamped === 0) next = { mode: 'live', day: today }
    else if (clamped > 0) next = { mode: 'forecast', day: addDays(today, clamped) }
    else {
      let day = addDays(today, clamped)
      if (domain.monthly) day = `${day.slice(0, 7)}-01`
      next = { mode: 'past', day }
    }
    setTime(next)
  }

  const label =
    time.mode === 'live'
      ? t('time.live')
      : time.mode === 'forecast'
        ? t('time.forecast', { days: forecastDays(time) })
        : formatDate(locale, `${time.day}T00:00:00Z`, 'long')

  return (
    <div
      className="timeline glass"
      role="group"
      aria-label={t('a11y.timeline')}
      data-testid="timeline"
    >
      <Button
        variant="quiet"
        size="sm"
        aria-label={t('story.prev')}
        onClick={() =>
          apply(
            domain.monthly
              ? daysBetween(today, addMonths(time.mode === 'live' ? today : time.day, -1))
              : value - 1,
          )
        }
      >
        <Icons.chevronLeft size={14} />
      </Button>
      <input
        className="timeline__range"
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => apply(Number(e.target.value))}
        aria-label={t('time.slider')}
        aria-valuetext={label}
        style={
          { '--live-pos': `${((0 - min) / Math.max(1, max - min)) * 100}%` } as React.CSSProperties
        }
      />
      <Button
        variant="quiet"
        size="sm"
        aria-label={t('story.next')}
        onClick={() =>
          apply(
            domain.monthly && value < 0 ? daysBetween(today, addMonths(time.day, 1)) : value + 1,
          )
        }
      >
        <Icons.chevronRight size={14} />
      </Button>
      <div
        className={`timeline__label num${time.mode === 'forecast' ? ' is-forecast' : ''}`}
        aria-live="polite"
      >
        {label}
      </div>
      {time.mode !== 'live' ? (
        <Button size="sm" icon={<Icons.live size={14} />} onClick={() => apply(0)}>
          {t('time.backToLive')}
        </Button>
      ) : (
        <span className="timeline__live">
          <Icons.live size={14} /> {t('badge.live')}
        </span>
      )}
    </div>
  )
}
