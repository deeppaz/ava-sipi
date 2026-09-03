import { type ComponentType, lazy, Suspense, useEffect, useState } from 'react'
import { useI18n } from '@/i18n'
import { startFpsMonitor } from '@/lib/fps'
import { useManifest } from '@/lib/manifest'
import { MapView } from '@/map/MapView'
import { LayerRail } from '@/panels/LayerRail'
import { ForecastWatermark, HoverTooltip, PerfNotice, Toast } from '@/panels/Overlays'
import { TimeSlider } from '@/panels/TimeSlider'
import { TopBar } from '@/panels/TopBar'
import { useApp } from '@/state/store'
import { useUrlSync } from '@/state/url'
import './app.css'

/** Interaction-only surfaces; keeping them out of the first chunk halves the initial JS. */
const lazyPanel = <P,>(load: () => Promise<{ [k: string]: unknown }>, name: string) =>
  lazy(async () => ({ default: (await load())[name] as ComponentType<P> }))

const DetailPanel = lazyPanel<{ mobile: boolean }>(
  () => import('@/panels/DetailPanel'),
  'DetailPanel',
)
const EventsList = lazyPanel<{ mobile: boolean }>(() => import('@/panels/EventsList'), 'EventsList')
const CommandPalette = lazyPanel<Record<string, never>>(
  () => import('@/panels/CommandPalette'),
  'CommandPalette',
)
const StoryMode = lazyPanel<Record<string, never>>(() => import('@/panels/StoryMode'), 'StoryMode')

function useMobile(): boolean {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const mq = matchMedia('(max-width: 767px)')
    const on = () => setMobile(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return mobile
}

export function App() {
  const { t } = useI18n()
  useUrlSync()
  const mobile = useMobile()
  const embed = useApp((s) => s.embed)
  const setPerfLevel = useApp((s) => s.setPerfLevel)
  const manifestError = useManifest((s) => s.error)
  const source = useManifest((s) => s.source)

  useEffect(() => {
    // the static boot skeleton in index.html has done its job once the shell is mounted
    document.getElementById('boot')?.remove()
    void useManifest.getState().load()
  }, [])
  useEffect(() => startFpsMonitor((level) => setPerfLevel(level)), [setPerfLevel])

  return (
    <div className={`app${embed ? ' app--embed' : ''}${mobile ? ' app--mobile' : ''}`}>
      <a className="skip-link" href="#map">
        {t('app.skipToMap')}
      </a>
      <div id="map" className="app__map">
        <MapView />
      </div>
      <ForecastWatermark />
      {!embed ? (
        <TopBar mobile={mobile} />
      ) : (
        <div className="topbar topbar--embed glass">
          <span className="wordmark" style={{ fontSize: 20 }}>
            Ava Sipî
          </span>
        </div>
      )}
      {!embed ? <LayerRail mobile={mobile} /> : null}
      {!embed ? <TimeSlider /> : null}
      <Suspense fallback={null}>
        <DetailPanel mobile={mobile} />
        {!embed ? <EventsList mobile={mobile} /> : null}
        {!embed ? <CommandPalette /> : null}
        <StoryMode />
      </Suspense>
      <HoverTooltip />
      <Toast />
      <PerfNotice />
      {manifestError && source === 'none' ? (
        <div className="notice glass" role="alert">
          {t('error.manifest')}
        </div>
      ) : null}
    </div>
  )
}
