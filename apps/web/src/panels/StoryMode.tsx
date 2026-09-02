import { Button, IconButton } from '@ava-sipi/ui'
import { useEffect, useRef } from 'react'
import { Icons } from '@/design/icons'
import { useI18n } from '@/i18n'
import { useData } from '@/state/data'
import { todayUtc, useApp } from '@/state/store'
import { parseTime } from '@/state/url'
import { storyById } from '@/stories'

/** Story mode (spec §5.5): JSON steps drive camera, layers, time and text; ← → or scroll advance. */
export function StoryMode() {
  const { t } = useI18n()
  const story = useApp((s) => s.story)
  const setStory = useApp((s) => s.setStory)
  const def = story ? storyById(story.id) : undefined
  const step =
    def && story ? def.steps[Math.min(def.steps.length, Math.max(1, story.step)) - 1] : undefined
  const wheelLock = useRef(0)
  const reservoirs = useData((s) => s.reservoirs.data)

  // apply the step
  useEffect(() => {
    if (!def || !step || !story) return
    const st = useApp.getState()
    st.setLayers(step.layers)
    const time =
      step.time === 'live'
        ? { mode: 'live' as const, day: todayUtc() }
        : (parseTime(step.time.startsWith('forecast+') ? `f+${step.time.slice(9)}` : step.time) ?? {
            mode: 'live' as const,
            day: todayUtc(),
          })
    st.setTime(time)
    st.requestCamera(step.camera, { durationMs: 2400, padRight: false })
    st.select(null)
    if (step.select) {
      const [layer, mode, needle] = step.select.split(':')
      if (layer === 'reservoirs' && mode === 'name' && needle) {
        const r = reservoirs?.reservoirs.find((x) =>
          x.name.toLowerCase().includes(needle.toLowerCase()),
        )
        if (r) st.select({ layer: 'reservoirs', id: r.id })
      }
    }
  }, [def, step, story, reservoirs])

  useEffect(() => {
    if (!def || !story) return
    const go = (delta: number) => {
      const next = story.step + delta
      if (next < 1) return
      if (next > def.steps.length) return
      setStory({ id: story.id, step: next })
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'Escape') setStory(null)
    }
    const onWheel = (e: WheelEvent) => {
      const now = Date.now()
      if (now - wheelLock.current < 900 || Math.abs(e.deltaY) < 20) return
      if (!(e.target as HTMLElement).closest('.story')) return
      wheelLock.current = now
      go(e.deltaY > 0 ? 1 : -1)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', onWheel)
    }
  }, [def, story, setStory])

  if (!def || !step || !story) return null
  const n = story.step
  const total = def.steps.length
  return (
    <aside className="story glass fade-in" aria-label={t(def.titleKey)} data-testid="story">
      <header className="story__head">
        <div>
          <h2 className="story__title">{t(def.titleKey)}</h2>
          <p className="text-secondary">{t(def.subtitleKey)}</p>
        </div>
        <IconButton label={t('story.exit')} onClick={() => setStory(null)}>
          <Icons.close />
        </IconButton>
      </header>
      <p className="story__text" key={step.id}>
        {t(step.text)}
      </p>
      <footer className="story__foot">
        <span className="text-secondary num">{t('story.step', { n, total })}</span>
        <span className="story__nav">
          <Button
            size="sm"
            variant="quiet"
            disabled={n <= 1}
            onClick={() => setStory({ id: story.id, step: n - 1 })}
            aria-label={t('story.prev')}
          >
            <Icons.chevronLeft size={14} />
          </Button>
          <Button
            size="sm"
            variant="solid"
            disabled={n >= total}
            onClick={() => setStory({ id: story.id, step: n + 1 })}
          >
            {t('story.next')}
          </Button>
        </span>
      </footer>
      <p className="story__hint text-secondary">{t('story.keys')}</p>
    </aside>
  )
}
