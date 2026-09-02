import { visibleLayers } from '@ava-sipi/layers'
import { cx, IconButton, Switch } from '@ava-sipi/ui'
import { useState } from 'react'
import { Icons } from '@/design/icons'
import { useI18n } from '@/i18n'
import { isStale, layerManifest, useManifest } from '@/lib/manifest'
import { useApp } from '@/state/store'
import { Legend } from './Legend'

/** Left rail (spec §5.1): 56 px collapsed, 200 px on hover/focus, `switch` semantics. */
export function LayerRail({ mobile }: { mobile: boolean }) {
  const { t } = useI18n()
  const layers = useApp((s) => s.layers)
  const setLayer = useApp((s) => s.setLayer)
  const legendOpen = useApp((s) => s.legendOpen)
  const setLegendOpen = useApp((s) => s.setLegendOpen)
  const manifest = useManifest((s) => s.manifest)
  const [expanded, setExpanded] = useState(false)

  return (
    <nav
      className={cx('rail glass', expanded && !mobile && 'is-open', mobile && 'rail--mobile')}
      aria-label={t('a11y.rail')}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onFocus={() => setExpanded(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setExpanded(false)
      }}
      data-testid="layer-rail"
    >
      <ul className="rail__list" aria-label={t('rail.layers')}>
        {visibleLayers.map((def) => {
          const on = layers.includes(def.id)
          const Icon = Icons[def.icon]
          const lm = layerManifest(manifest, def.id)
          const stale = isStale(lm)
          const sample = lm?.sample
          const missing = !!manifest && !lm
          const name = t(def.nameKey)
          return (
            <li
              key={def.id}
              className={cx('rail__item', on && 'is-on')}
              style={{ '--layer-color': `var(--${def.color})` } as React.CSSProperties}
            >
              <button
                type="button"
                className="rail__btn"
                onClick={() => setLayer(def.id, !on)}
                aria-pressed={on}
                aria-label={t('rail.toggle', {
                  layer: name,
                  state: t(on ? 'rail.off' : 'rail.on'),
                })}
                title={`${name} — ${t(def.descriptionKey)}`}
                data-testid={`layer-${def.id}`}
                disabled={missing}
              >
                <span className="rail__marker" aria-hidden="true" />
                <span className="rail__icon">
                  <Icon />
                </span>
                <span className="rail__label">
                  <span className="rail__name">{name}</span>
                  {stale ? (
                    <span className="rail__badge rail__badge--stale">{t('badge.stale')}</span>
                  ) : null}
                  {!stale && sample ? (
                    <span className="rail__badge">{t('badge.sample')}</span>
                  ) : null}
                </span>
              </button>
              {!mobile ? (
                <span className="rail__switch">
                  <Switch
                    checked={on}
                    onChange={(v) => setLayer(def.id, v)}
                    label={name}
                    color={def.color}
                    disabled={missing}
                  />
                </span>
              ) : null}
            </li>
          )
        })}
      </ul>
      {!mobile ? (
        <div className="rail__foot">
          <IconButton
            label={t('rail.legend')}
            active={legendOpen}
            onClick={() => setLegendOpen(!legendOpen)}
          >
            <Icons.legend />
          </IconButton>
          {expanded ? <span className="rail__label rail__name">{t('rail.legend')}</span> : null}
        </div>
      ) : null}
      {legendOpen ? <Legend onClose={() => setLegendOpen(false)} /> : null}
    </nav>
  )
}
