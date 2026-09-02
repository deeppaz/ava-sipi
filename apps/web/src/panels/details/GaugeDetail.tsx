import type { Gauge } from '@ava-sipi/schema'
import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n'
import { formatNumber } from '@/lib/format'
import { fetchNwpsSeries, fetchUsgsSeries, type Series } from '@/lib/live'
import { layerManifest, useManifest } from '@/lib/manifest'
import { discharge as toDischarge, length as toLength } from '@/lib/units'
import { useApp } from '@/state/store'
import { MetaList, Metric, Notes, SourceRow } from '../Meta'
import { Sparkline } from '../Sparkline'

export function GaugeDetail({ gauge }: { gauge: Gauge }) {
  const { t, locale } = useI18n()
  const units = useApp((s) => s.units)
  const lm = useManifest((s) => layerManifest(s.manifest, 'gauges'))
  const [series, setSeries] = useState<Series | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    const ac = new AbortController()
    setState('loading')
    setSeries(null)
    const load = gauge.nwsLid
      ? fetchNwpsSeries(gauge.nwsLid, ac.signal).catch(() =>
          fetchUsgsSeries(gauge.id, 7, ac.signal),
        )
      : fetchUsgsSeries(gauge.id, 7, ac.signal)
    load.then(
      (s) => {
        if (ac.signal.aborted) return
        setSeries(s)
        setState('ready')
      },
      () => !ac.signal.aborted && setState('error'),
    )
    return () => ac.abort()
  }, [gauge.id, gauge.nwsLid])

  const q = gauge.discharge ? toDischarge(gauge.discharge.value, units) : null
  const st = gauge.stage ? toLength(gauge.stage.value, units) : null
  const convert =
    series?.unit === 'm'
      ? (v: number) => toLength(v, units).value
      : (v: number) => toDischarge(v, units).value
  const seriesUnit = series?.unit === 'm' ? toLength(0, units).unit : toDischarge(0, units).unit

  return (
    <>
      <header className="panel__head">
        <h2 className="panel__title">{gauge.name}</h2>
        <p className="text-secondary">
          {gauge.riverName ? `${gauge.riverName} · ` : ''}
          {gauge.source.toUpperCase()}
          {gauge.nwsLid ? ` · NWS ${gauge.nwsLid}` : ''} · {gauge.id}
        </p>
      </header>
      {q ? (
        <Metric
          value={formatNumber(locale, q.value)}
          unit={q.unit}
          label={
            gauge.percentile !== undefined
              ? t('gauge.percentile', { p: Math.round(gauge.percentile) })
              : t('gauge.noPercentile')
          }
        />
      ) : st ? (
        <Metric value={formatNumber(locale, st.value, 2)} unit={st.unit} label={t('gauge.stage')} />
      ) : (
        <Metric value="—" label={t('panel.noData')} />
      )}
      {state === 'loading' ? <p className="text-secondary">{t('panel.loadingSeries')}…</p> : null}
      {state === 'error' ? (
        <p className="text-secondary">
          {t('panel.seriesError', { source: gauge.nwsLid ? 'NOAA' : 'USGS' })}
        </p>
      ) : null}
      {series && series.points.length > 1 ? (
        <Sparkline
          points={series.points}
          forecast={series.forecast}
          unit={seriesUnit}
          convert={convert}
          ariaLabel={`${gauge.name} 7d`}
        />
      ) : null}
      <MetaList
        rows={[
          q && st ? [t('gauge.stage'), `${formatNumber(locale, st.value, 2)} ${st.unit}`] : null,
          gauge.floodCategory
            ? [t('gauge.floodCategory'), t(`flood.${gauge.floodCategory}`)]
            : null,
          gauge.percentile !== undefined
            ? [t('legend.percentile'), formatNumber(locale, gauge.percentile, 0)]
            : null,
        ]}
      />
      <Notes keys={lm?.notes ?? []} />
      <SourceRow
        sourceUrl={
          series?.sourceUrl ??
          `https://waterdata.usgs.gov/monitoring-location/${gauge.id.replace('USGS-', '')}/`
        }
        {...(lm ? { lm } : {})}
        {...((gauge.discharge?.ts ?? gauge.stage?.ts)
          ? { measuredAt: gauge.discharge?.ts ?? gauge.stage?.ts }
          : {})}
      />
    </>
  )
}
