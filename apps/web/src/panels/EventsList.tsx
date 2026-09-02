import { IconButton, Sheet } from '@ava-sipi/ui'
import { Icons } from '@/design/icons'
import { useI18n } from '@/i18n'
import { formatAgo } from '@/lib/format'
import { useData } from '@/state/data'
import { useApp } from '@/state/store'

export function EventsList({ mobile }: { mobile: boolean }) {
  const { t, locale } = useI18n()
  const open = useApp((s) => s.eventsOpen)
  const setOpen = useApp((s) => s.setEventsOpen)
  const setLayer = useApp((s) => s.setLayer)
  const select = useApp((s) => s.select)
  const requestCamera = useApp((s) => s.requestCamera)
  const events = useData((s) => s.events.data)
  const feats = events?.features ?? []
  return (
    <Sheet
      open={open}
      onClose={() => setOpen(false)}
      title={t('event.list')}
      side={mobile ? 'bottom' : 'right'}
      className="panel"
    >
      <div className="panel__close">
        <IconButton label={t('panel.close')} onClick={() => setOpen(false)}>
          <Icons.close />
        </IconButton>
      </div>
      <div className="panel__body scroll">
        <header className="panel__head">
          <h2 className="panel__title">{t('event.list')}</h2>
        </header>
        {feats.length === 0 ? (
          <p className="text-secondary">{t('event.none')}</p>
        ) : (
          <ul className="panel__list">
            {feats.map((f) => {
              const p = f.properties
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    className="panel__link"
                    onClick={() => {
                      setLayer('events', true)
                      requestCamera(
                        { lon: p.centroid[0], lat: p.centroid[1], zoom: 6 },
                        { durationMs: 1600 },
                      )
                      select({ layer: 'events', id: p.id, lon: p.centroid[0], lat: p.centroid[1] })
                      setOpen(false)
                    }}
                  >
                    <span className={`dot dot--${p.type} dot--${p.severity}`} aria-hidden="true" />
                    {p.title}
                    <span className="text-secondary num">
                      {' '}
                      · {t(`event.severity.${p.severity}`)} · {formatAgo(locale, p.updatedAt)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Sheet>
  )
}
