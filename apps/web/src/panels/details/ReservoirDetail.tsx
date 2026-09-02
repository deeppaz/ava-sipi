import type { Reservoir } from '@ava-sipi/schema'
import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n'
import { resolveUrl } from '@/lib/fetch'
import { formatNumber, formatSigned } from '@/lib/format'
import { fetchJsonSeries, type SeriesPoint } from '@/lib/live'
import { layerManifest, useManifest } from '@/lib/manifest'
import { areaKm2, volumeMcm } from '@/lib/units'
import { useApp } from '@/state/store'
import { MetaList, Metric, Notes, SourceRow } from '../Meta'
import { Sparkline } from '../Sparkline'

export function ReservoirDetail({ reservoir: r }: { reservoir: Reservoir }) {
  const { t, locale } = useI18n()
  const units = useApp((s) => s.units)
  const lm = useManifest((s) => layerManifest(s.manifest, 'reservoirs'))
  const base = useManifest((s) => s.base)
  const [points, setPoints] = useState<SeriesPoint[] | null>(null)
  const [p95, setP95] = useState<number | undefined>(undefined)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    const ac = new AbortController()
    setState('loading')
    fetchJsonSeries(resolveUrl(r.seriesUrl, base), ac.signal).then(
      (s) => {
        if (ac.signal.aborted) return
        setPoints(s.points)
        setP95(s.areaP95Km2)
        setState('ready')
      },
      () => !ac.signal.aborted && setState('error'),
    )
    return () => ac.abort()
  }, [r.seriesUrl, base])

  const area = r.areaKm2 !== undefined ? areaKm2(r.areaKm2, units) : null
  return (
    <>
      <header className="panel__head">
        <h2 className="panel__title">{r.name}</h2>
        <p className="text-secondary">
          {r.country ? `${r.country} · ` : ''}Global Water Watch
          {r.grandId ? ` · GRanD ${r.grandId}` : ''}
        </p>
      </header>
      <Metric
        value={r.fillPct !== undefined ? formatNumber(locale, r.fillPct, 0) : '—'}
        unit={r.fillPct !== undefined ? '%' : undefined}
        label={t('reservoir.fill')}
      />
      {state === 'loading' ? <p className="text-secondary">{t('panel.loadingSeries')}…</p> : null}
      {state === 'error' ? <p className="text-secondary">{t('panel.noSeries')}</p> : null}
      {points && points.length > 1 ? (
        <>
          <p className="text-secondary">{t('reservoir.series')}</p>
          <Sparkline
            points={points}
            unit={areaKm2(0, units).unit}
            convert={(v) => areaKm2(v, units).value}
            {...(p95 !== undefined ? { reference: p95 } : {})}
            ariaLabel={r.name}
          />
        </>
      ) : null}
      <MetaList
        rows={[
          area ? [t('reservoir.area'), `${formatNumber(locale, area.value)} ${area.unit}`] : null,
          r.trend90d !== undefined
            ? [
                t('reservoir.trend'),
                `${formatSigned(locale, r.trend90d)} pt · ${t(r.trend90d < 0 ? 'reservoir.falling' : 'reservoir.rising')}`,
              ]
            : null,
          r.capacityMcm !== undefined
            ? [
                t('reservoir.capacity'),
                `${formatNumber(locale, volumeMcm(r.capacityMcm, units).value)} ${volumeMcm(r.capacityMcm, units).unit}`,
              ]
            : null,
        ]}
      />
      <Notes keys={[...new Set([...(lm?.notes ?? []), 'reservoirs.proxy'])]} />
      <SourceRow
        sourceUrl="https://www.globalwaterwatch.earth"
        {...(lm ? { lm } : {})}
        {...(r.observedAt ? { measuredAt: r.observedAt } : {})}
      />
    </>
  )
}
