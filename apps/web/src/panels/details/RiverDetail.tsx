import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n'
import { ratioFor } from '@/layers/riverMath'
import { ratioClass } from '@/lib/color'
import { formatNumber } from '@/lib/format'
import { fetchRiverSeries, type Series } from '@/lib/live'
import { layerManifest, useManifest } from '@/lib/manifest'
import { distanceKm, discharge as toDischarge } from '@/lib/units'
import { type RiverFeature, useData } from '@/state/data'
import { forecastDays, useApp } from '@/state/store'
import { MetaList, Metric, Notes, SourceRow } from '../Meta'
import { Sparkline } from '../Sparkline'

export function RiverDetail({ feature }: { feature: RiverFeature }) {
  const { t, locale } = useI18n()
  const units = useApp((s) => s.units)
  const time = useApp((s) => s.time)
  const lm = useManifest((s) => layerManifest(s.manifest, 'rivers'))
  const rivers = useData((s) => s.rivers.data)
  const row = rivers?.discharge.get(feature.id)
  const ratio = ratioFor(feature, row, forecastDays(time))
  const [series, setSeries] = useState<Series | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [lon, lat] = feature.mid

  useEffect(() => {
    const ac = new AbortController()
    setState('loading')
    fetchRiverSeries(lat, lon, ac.signal).then(
      (s) => {
        if (ac.signal.aborted) return
        setSeries(s)
        setState('ready')
      },
      () => !ac.signal.aborted && setState('error'),
    )
    return () => ac.abort()
  }, [lat, lon])

  const mean = toDischarge(feature.meanDischarge, units)
  const today = row ? toDischarge(row.today, units) : null
  const cls = ratioClass(ratio)
  return (
    <>
      <header className="panel__head">
        <h2 className="panel__title">{feature.name ?? t('river.title')}</h2>
        <p className="text-secondary">
          {t('river.order', { n: feature.order })} · Open-Meteo · GloFAS
        </p>
      </header>
      {today ? (
        <Metric
          value={formatNumber(locale, today.value)}
          unit={today.unit}
          label={`${t('river.today')} · ${ratio !== undefined ? t('river.ratio', { ratio: ratio.toFixed(2) }) : ''} · ${t(`river.${cls}`)}`}
        />
      ) : (
        <Metric
          value={formatNumber(locale, mean.value)}
          unit={mean.unit}
          label={t('river.ratioUnknown')}
        />
      )}
      {state === 'loading' ? <p className="text-secondary">{t('panel.loadingSeries')}…</p> : null}
      {state === 'error' ? (
        <p className="text-secondary">{t('panel.seriesError', { source: 'Open-Meteo' })}</p>
      ) : null}
      {series && series.points.length > 1 ? (
        <>
          <p className="text-secondary">{t('river.series')}</p>
          <Sparkline
            points={series.points}
            forecast={series.forecast}
            unit={mean.unit}
            convert={(v) => toDischarge(v, units).value}
            reference={feature.meanDischarge}
            ariaLabel={feature.name ?? 'river'}
          />
        </>
      ) : null}
      <MetaList
        rows={[
          [t('river.meanDischarge'), `${formatNumber(locale, mean.value)} ${mean.unit}`],
          feature.lengthKm !== undefined
            ? [
                t('river.length'),
                `${formatNumber(locale, distanceKm(feature.lengthKm, units).value)} ${distanceKm(feature.lengthKm, units).unit}`,
              ]
            : null,
        ]}
      />
      <Notes keys={lm?.notes ?? []} />
      <SourceRow
        sourceUrl={series?.sourceUrl ?? 'https://www.hydrosheds.org/products/hydrorivers'}
        {...(lm ? { lm } : {})}
        {...(rivers?.dischargeDay ? { measuredAt: `${rivers.dischargeDay}T00:00:00Z` } : {})}
      />
    </>
  )
}
