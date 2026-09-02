import { useI18n } from '@/i18n'
import { formatNumber, formatSigned } from '@/lib/format'
import { layerManifest, useManifest } from '@/lib/manifest'
import { areaKm2 } from '@/lib/units'
import { useData } from '@/state/data'
import { useApp } from '@/state/store'
import { MetaList, Metric, Notes, SourceRow } from '../Meta'

export function GlacierDetail({ id }: { id: string }) {
  const { t, locale } = useI18n()
  const units = useApp((s) => s.units)
  const lm = useManifest((s) => layerManifest(s.manifest, 'glaciers'))
  const data = useData((s) => s.glaciers.data)
  const f = data?.outlines.features.find((x) => x.properties.id === id)
  const props = f?.properties
  const region = props?.region
  const regionRows = data?.massBalance?.regions.filter((r) => r.region === region) ?? []
  const newest = regionRows[0]
  const area = props ? areaKm2(props.areaKm2, units) : null
  return (
    <>
      <header className="panel__head">
        <h2 className="panel__title">{props?.name ?? id}</h2>
        <p className="text-secondary">
          {t('glacier.region')} {newest?.regionName ?? region ?? '—'} · RGI
        </p>
      </header>
      {props?.massBalanceMwe !== undefined ? (
        <Metric
          value={formatSigned(locale, props.massBalanceMwe, 2)}
          unit="m w.e."
          label={`${t('glacier.massBalance')} · ${newest?.year ?? ''} ${props.massBalanceMwe < 0 ? `· ${t('glacier.melting')}` : ''}`}
        />
      ) : (
        <Metric value="—" label={t('panel.noData')} />
      )}
      <MetaList
        rows={[
          area ? [t('glacier.area'), `${formatNumber(locale, area.value, 1)} ${area.unit}`] : null,
          ...regionRows
            .slice(0, 5)
            .map(
              (r) =>
                [
                  String(r.year),
                  `${formatSigned(locale, r.mwe, 2)} m w.e.${r.gt !== undefined ? ` · ${formatSigned(locale, r.gt, 1)} Gt` : ''}`,
                ] as [string, string],
            ),
        ]}
      />
      <Notes keys={lm?.notes ?? []} />
      <SourceRow
        sourceUrl={data?.massBalance?.sourceUrl ?? 'https://wgms.ch'}
        {...(lm ? { lm } : {})}
      />
    </>
  )
}
