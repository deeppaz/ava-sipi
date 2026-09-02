import type { WaterEventCollection } from '@ava-sipi/schema'
import { useMemo } from 'react'
import { useI18n } from '@/i18n'
import { formatCompact, formatDateTime } from '@/lib/format'
import { haversineKm } from '@/lib/geo'
import { layerManifest, useManifest } from '@/lib/manifest'
import { useData } from '@/state/data'
import { useApp } from '@/state/store'
import { MetaList, Metric, Notes, SourceRow } from '../Meta'

type EventFeature = WaterEventCollection['features'][number]

export function EventDetail({ feature }: { feature: EventFeature }) {
  const { t, locale } = useI18n()
  const lm = useManifest((s) => layerManifest(s.manifest, 'events'))
  const gauges = useData((s) => s.gauges.data)
  const select = useApp((s) => s.select)
  const setLayer = useApp((s) => s.setLayer)
  const p = feature.properties
  const nearby = useMemo(() => {
    if (!gauges) return []
    return gauges.gauges
      .map((g) => ({ g, d: haversineKm(p.centroid, [g.lon, g.lat]) }))
      .filter((x) => x.d < 150)
      .sort((a, b) => a.d - b.d)
      .slice(0, 5)
  }, [gauges, p.centroid])

  return (
    <>
      <header className="panel__head">
        <h2 className="panel__title">{p.title}</h2>
        <p className="text-secondary">
          GDACS · {t(`event.type.${p.type}`)} · {t(`event.severity.${p.severity}`)}
        </p>
      </header>
      <Metric
        value={
          p.affectedPopulation !== undefined ? formatCompact(locale, p.affectedPopulation) : '—'
        }
        label={
          p.affectedPopulation !== undefined
            ? t('event.population')
            : (p.severityText ?? t('panel.noData'))
        }
      />
      <MetaList
        rows={[
          [t('event.started'), formatDateTime(locale, p.startedAt)],
          [t('event.updated'), formatDateTime(locale, p.updatedAt)],
          p.country ? [t('event.country'), p.country] : null,
          p.severityText && p.affectedPopulation !== undefined ? ['·', p.severityText] : null,
        ]}
      />
      <section>
        <h3 className="panel__sub">{t('panel.nearby')}</h3>
        {nearby.length === 0 ? (
          <p className="text-secondary">{t('panel.nearbyNone')}</p>
        ) : (
          <ul className="panel__list">
            {nearby.map(({ g, d }) => (
              <li key={g.id}>
                <button
                  type="button"
                  className="panel__link"
                  onClick={() => {
                    setLayer('gauges', true)
                    select({ layer: 'gauges', id: g.id, lon: g.lon, lat: g.lat })
                  }}
                >
                  {g.name}{' '}
                  <span className="text-secondary num">
                    · {Math.round(d)} km
                    {g.floodCategory && g.floodCategory !== 'none'
                      ? ` · ${t(`flood.${g.floodCategory}`)}`
                      : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Notes keys={lm?.notes ?? []} />
      <SourceRow sourceUrl={p.sourceUrl} {...(lm ? { lm } : {})} measuredAt={p.updatedAt} />
    </>
  )
}
