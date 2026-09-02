import { useI18n } from '@/i18n'
import { formatNumber, formatSigned } from '@/lib/format'
import { layerManifest, useManifest } from '@/lib/manifest'
import { useRasterSamples } from '@/state/raster'
import { MetaList, Metric, Notes, SourceRow } from '../Meta'

export function RasterDetail({
  layer,
  id,
  lon,
  lat,
}: {
  layer: 'drought' | 'groundwater'
  id: string
  lon: number
  lat: number
}) {
  const { t, locale } = useI18n()
  const lm = useManifest((s) => layerManifest(s.manifest, layer))
  const sample = useRasterSamples((s) => s.samples[id])
  const title = layer === 'drought' ? t('drought.title') : t('groundwater.title')
  let value = '—'
  let label = t('panel.noData')
  let unit: string | undefined
  if (sample) {
    if (sample.unit === 'class') {
      value = sample.cls ? t(`drought.class.${sample.cls}`) : t('drought.class.none')
      label = t('drought.class')
    } else if (sample.value !== null) {
      value =
        sample.unit === 'cm'
          ? formatSigned(locale, sample.value, 0)
          : formatNumber(locale, sample.value, 0)
      unit = sample.unit === 'cm' ? 'cm' : undefined
      label = sample.unit === 'cm' ? t('groundwater.value') : t('groundwater.percentile')
    }
  } else {
    label = `${t('panel.loadingSeries')}…`
  }
  return (
    <>
      <header className="panel__head">
        <h2 className="panel__title">{title}</h2>
        <p className="text-secondary num">
          {lat.toFixed(2)}°, {lon.toFixed(2)}° · {lm?.attribution.name.split('·')[0]?.trim()}
        </p>
      </header>
      <Metric value={value} {...(unit ? { unit } : {})} label={label} />
      <MetaList rows={[lm ? [t('badge.live'), lm.sourceUpdatedAt.slice(0, 10)] : null]} />
      <p className="text-secondary">{t('panel.noSeries')}</p>
      <Notes
        keys={[...(lm?.notes ?? []), ...(layer === 'groundwater' ? ['groundwater.tws'] : [])]}
      />
      <SourceRow {...(lm ? { lm } : {})} {...(lm ? { measuredAt: lm.sourceUpdatedAt } : {})} />
    </>
  )
}
