import { layerById } from '@ava-sipi/layers'
import { IconButton } from '@ava-sipi/ui'
import { Icons } from '@/design/icons'
import { useI18n } from '@/i18n'
import { layerManifest, useManifest } from '@/lib/manifest'
import { useApp } from '@/state/store'

/** Legend for the active layers, with pattern hints for colour-blind users (spec §5.7). */
export function Legend({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const layers = useApp((s) => s.layers)
  const manifest = useManifest((s) => s.manifest)
  return (
    <section className="legend glass" aria-label={t('legend.title')} data-testid="legend">
      <header className="legend__head">
        <h2 className="legend__title">{t('legend.title')}</h2>
        <IconButton label={t('panel.close')} onClick={onClose}>
          <Icons.close size={14} />
        </IconButton>
      </header>
      {layers.map((id) => {
        const def = layerById[id]
        const legend = layerManifest(manifest, id)?.legend ?? def.legend
        return (
          <div key={id} className="legend__layer">
            <div className="legend__name">
              {t(def.nameKey)}{' '}
              <span className="text-secondary">
                ·{' '}
                {t(`legend.${legend.unit}`) === `legend.${legend.unit}`
                  ? legend.unit
                  : t(`legend.${legend.unit}`)}
              </span>
            </div>
            <ul className="legend__stops">
              {legend.stops.map((s, i) => (
                <li
                  key={`${s.value}-${s.label}`}
                  className="legend__stop"
                  title={def.legendPatterns?.[i]}
                >
                  <span
                    className={`legend__swatch legend__swatch--${def.legendPatterns?.[i] ?? 'solid'}`}
                    style={{
                      background: s.color === 'transparent' ? 'transparent' : s.color,
                      borderColor: s.color === 'transparent' ? 'var(--tide)' : s.color,
                    }}
                    aria-hidden="true"
                  />
                  <span className="num">
                    {s.label.startsWith('drought.') ? t(s.label) : s.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
      {layers.includes('rivers') ? (
        <p className="legend__hint text-secondary">{t('legend.patterns')}</p>
      ) : null}
    </section>
  )
}
