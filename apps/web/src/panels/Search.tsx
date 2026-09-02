import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Icons } from '@/design/icons'
import { useI18n } from '@/i18n'
import { getIndex, type SearchResult, search } from '@/lib/search'
import { useData } from '@/state/data'
import { useApp } from '@/state/store'

export function useGoTo() {
  const requestCamera = useApp((s) => s.requestCamera)
  const setLayer = useApp((s) => s.setLayer)
  const select = useApp((s) => s.select)
  return (r: SearchResult) => {
    if (r.layer) setLayer(r.layer, true)
    requestCamera(
      { lon: r.lon, lat: r.lat, zoom: r.zoom, bearing: 0, pitch: 0 },
      { durationMs: 1600 },
    )
    if (r.layer && r.selectId) select({ layer: r.layer, id: r.selectId, lon: r.lon, lat: r.lat })
    else select(null)
  }
}

/** Top-centre search (spec §5.1): rivers, reservoirs, glaciers, places, stations, events. */
export function Search() {
  const { t } = useI18n()
  const id = useId()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const data = useData()
  const goTo = useGoTo()
  const results = useMemo(() => (q.length >= 2 ? search(getIndex(data), q) : []), [q, data])

  useEffect(() => setActive(0), [results])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const choose = (r: SearchResult) => {
    goTo(r)
    setQ('')
    setOpen(false)
    inputRef.current?.blur()
  }

  return (
    <div className="search glass" data-testid="search">
      <span className="search__icon" aria-hidden="true">
        <Icons.search size={16} />
      </span>
      <input
        ref={inputRef}
        className="search__input"
        type="search"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && results[active] ? `${id}-opt-${active}` : undefined}
        placeholder={t('app.search.placeholder')}
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => Math.min(results.length - 1, a + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(0, a - 1))
          } else if (e.key === 'Enter') {
            const r = results[active]
            if (r) choose(r)
          } else if (e.key === 'Escape') {
            setQ('')
            setOpen(false)
            inputRef.current?.blur()
          }
        }}
      />
      {open && q.length >= 2 ? (
        <ul id={`${id}-list`} className="search__results glass" role="listbox">
          {results.length === 0 ? (
            <li className="search__empty text-secondary">{t('app.search.noResults', { q })}</li>
          ) : (
            results.map((r, i) => (
              <li
                key={r.id}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                className={`search__item${i === active ? ' is-active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(r)
                }}
                onMouseEnter={() => setActive(i)}
              >
                <span className="search__title">{r.title}</span>
                <span className="search__type text-secondary">
                  {r.subtitle ? `${r.subtitle} · ` : ''}
                  {t(`search.type.${r.type}`)}
                </span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
