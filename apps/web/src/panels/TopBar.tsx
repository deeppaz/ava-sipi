import { IconButton, Kbd } from '@ava-sipi/ui'
import { useEffect, useMemo, useState } from 'react'
import { Icons } from '@/design/icons'
import { useI18n } from '@/i18n'
import { formatAgo } from '@/lib/format'
import { layerManifest, useManifest } from '@/lib/manifest'
import { useData } from '@/state/data'
import { useApp } from '@/state/store'
import { Search } from './Search'

/** Wordmark + status line (spec §5.1). The pulse line is fed by the events layer even when it is off. */
export function TopBar({ mobile }: { mobile: boolean }) {
  const { t, locale } = useI18n()
  const manifest = useManifest((s) => s.manifest)
  const source = useManifest((s) => s.source)
  const events = useData((s) => s.events.data)
  const layers = useApp((s) => s.layers)
  const setEventsOpen = useApp((s) => s.setEventsOpen)
  const setPaletteOpen = useApp((s) => s.setPaletteOpen)
  const [, tick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const updated = useMemo(() => {
    if (!manifest) return null
    const times = layers
      .map((id) => layerManifest(manifest, id)?.generatedAt)
      .filter((x): x is string => !!x)
    if (!times.length) return manifest.generatedAt
    return times.sort()[times.length - 1] ?? null
  }, [manifest, layers])
  const counts = useMemo(() => {
    const feats = events?.features ?? []
    return {
      floods: feats.filter((f) => f.properties.type === 'flood').length,
      droughts: feats.filter((f) => f.properties.type === 'drought').length,
    }
  }, [events])

  return (
    <header className="topbar">
      <div className="topbar__brand glass">
        <h1 className="wordmark">Ava Sipî</h1>
        <button
          type="button"
          className="topbar__status text-secondary"
          onClick={() => setEventsOpen(true)}
          aria-label={t('app.status.open')}
          data-testid="pulse-line"
        >
          {updated
            ? t('app.status.updated', { ago: formatAgo(locale, updated) })
            : t('app.status.never')}
          {events ? ` · ${t('app.status.pulse', counts)}` : ''}
          {source === 'sample' ? ` · ${t('app.status.offline')}` : ''}
        </button>
      </div>
      {!mobile ? <Search /> : null}
      <div className="topbar__right">
        <IconButton
          label={t('app.commandPalette')}
          onClick={() => setPaletteOpen(true)}
          data-testid="palette-button"
        >
          <Icons.command />
        </IconButton>
        {!mobile ? (
          <span className="topbar__kbd" aria-hidden="true">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
        ) : null}
      </div>
    </header>
  )
}
