import { visibleLayers } from '@ava-sipi/layers'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Icons } from '@/design/icons'
import { LANGS, useI18n } from '@/i18n'
import { PLACES } from '@/lib/places'
import { copyText, downloadCanvasPng, embedCode, screenshotFilename } from '@/lib/screenshot'
import { normalize } from '@/lib/search'
import { useApp } from '@/state/store'
import { shareUrl } from '@/state/url'
import { stories } from '@/stories'

interface Command {
  id: string
  section: string
  label: string
  keywords: string
  run: () => void
}

export function CommandPalette() {
  const { t, lang, setLang } = useI18n()
  const open = useApp((s) => s.paletteOpen)
  const setOpen = useApp((s) => s.setPaletteOpen)
  const st = useApp()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(!useApp.getState().paletteOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])
  useEffect(() => {
    if (open) {
      setQ('')
      setActive(0)
      setTimeout(() => inputRef.current?.focus(), 20)
    }
  }, [open])

  const commands = useMemo<Command[]>(() => {
    const close = () => setOpen(false)
    const list: Command[] = []
    for (const l of visibleLayers) {
      const name = t(l.nameKey)
      list.push({
        id: `layer:${l.id}`,
        section: t('cmd.section.layers'),
        label: t('cmd.toggleLayer', { layer: name }),
        keywords: `${name} ${l.id}`,
        run: () => st.toggleLayer(l.id),
      })
    }
    for (const s of stories) {
      list.push({
        id: `story:${s.id}`,
        section: t('cmd.section.stories'),
        label: t('cmd.story', { story: t(s.titleKey) }),
        keywords: `${t(s.titleKey)} ${s.id}`,
        run: () => {
          st.setStory({ id: s.id, step: 1 })
          close()
        },
      })
    }
    list.push({
      id: 'units',
      section: t('cmd.section.settings'),
      label: t('cmd.units', { units: t(`units.${st.units === 'metric' ? 'imperial' : 'metric'}`) }),
      keywords: 'units metric imperial birim yekîne',
      run: () => st.setUnits(st.units === 'metric' ? 'imperial' : 'metric'),
    })
    for (const l of LANGS) {
      if (l === lang) continue
      list.push({
        id: `lang:${l}`,
        section: t('cmd.section.settings'),
        label: t('cmd.language', { lang: t(`lang.${l}`) }),
        keywords: `language dil ziman ${l} ${t(`lang.${l}`)}`,
        run: () => {
          setLang(l)
          close()
        },
      })
    }
    list.push({
      id: 'motion',
      section: t('cmd.section.settings'),
      label: t('cmd.reducedMotion', { state: t(st.reducedMotion ? 'state.off' : 'state.on') }),
      keywords: 'motion animation hareket tevger',
      run: () => st.setReducedMotion(!st.reducedMotion),
    })
    list.push({
      id: 'projection',
      section: t('cmd.section.settings'),
      label: t('cmd.projection', {
        p: t(st.projection === 'globe' ? 'projection.mercator' : 'projection.globe'),
      }),
      keywords: 'globe flat projection küre glok',
      run: () => st.setProjection(st.projection === 'globe' ? 'mercator' : 'globe'),
    })
    list.push({
      id: 'share',
      section: t('cmd.section.actions'),
      label: t('cmd.share'),
      keywords: 'share link copy paylaş parve',
      run: async () => {
        const ok = await copyText(shareUrl())
        st.showToast(t(ok ? 'panel.copied' : 'clipboard.failed'))
        close()
      },
    })
    list.push({
      id: 'embed',
      section: t('cmd.section.actions'),
      label: t('cmd.embed'),
      keywords: 'embed iframe',
      run: async () => {
        const ok = await copyText(embedCode())
        st.showToast(t(ok ? 'embed.copied' : 'clipboard.failed'))
        close()
      },
    })
    list.push({
      id: 'screenshot',
      section: t('cmd.section.actions'),
      label: t('cmd.screenshot'),
      keywords: 'screenshot png ekran görüntüsü wêne',
      run: () => {
        const c = document.querySelector<HTMLCanvasElement>('.maplibregl-canvas')
        if (c) {
          downloadCanvasPng(c, screenshotFilename())
          st.showToast(t('screenshot.saved'))
        }
        close()
      },
    })
    for (const p of PLACES) {
      list.push({
        id: `place:${p.name}`,
        section: t('cmd.section.places'),
        label: t('cmd.goTo', { place: p.name }),
        keywords: [p.name, ...(p.aliases ?? [])].join(' '),
        run: () => {
          st.requestCamera({ lon: p.lon, lat: p.lat, zoom: p.zoom, bearing: 0, pitch: 0 })
          close()
        },
      })
    }
    return list
  }, [t, lang, setLang, setOpen, st])

  const filtered = useMemo(() => {
    const nq = normalize(q)
    const base = nq
      ? commands.filter((c) => normalize(`${c.label} ${c.keywords}`).includes(nq))
      : commands.filter((c) => !c.id.startsWith('place:'))
    return base.slice(0, 40)
  }, [q, commands])
  useEffect(() => setActive(0), [filtered])

  if (!open) return null
  return (
    <div className="palette-backdrop" onMouseDown={() => setOpen(false)} data-testid="palette">
      <div
        className="palette glass"
        role="dialog"
        aria-label={t('app.commandPalette')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="palette__input">
          <Icons.search size={16} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('cmd.placeholder')}
            aria-label={t('cmd.placeholder')}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false)
              else if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => Math.min(filtered.length - 1, a + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(0, a - 1))
              } else if (e.key === 'Enter') {
                const c = filtered[active]
                if (c) {
                  c.run()
                  if (
                    !c.id.startsWith('layer:') &&
                    !c.id.startsWith('units') &&
                    !c.id.startsWith('motion') &&
                    !c.id.startsWith('projection')
                  )
                    setOpen(false)
                }
              }
            }}
          />
        </div>
        <ul className="palette__list scroll" role="listbox">
          {filtered.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === active}
              className={`palette__item${i === active ? ' is-active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => {
                c.run()
              }}
            >
              <span>{c.label}</span>
              <span className="text-secondary palette__section">{c.section}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
