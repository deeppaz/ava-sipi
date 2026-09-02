/**
 * Frame-rate monitor (spec §5.6): rolling rAF delta average. Below 45 fps for 3 s the
 * density level rises (rivers LOD one step up, gauge clustering threshold up); sustained
 * > 55 fps for 10 s lowers it again. Max level 2.
 */
export type PerfLevel = 0 | 1 | 2

export function startFpsMonitor(onLevel: (level: PerfLevel, fps: number) => void): () => void {
  let raf = 0
  let last = performance.now()
  const deltas: number[] = []
  let level: PerfLevel = 0
  let lowSince: number | null = null
  let highSince: number | null = null
  let lastReport = 0

  const tick = (now: number) => {
    const dt = now - last
    last = now
    if (dt > 0 && dt < 1000) {
      deltas.push(dt)
      if (deltas.length > 60) deltas.shift()
    }
    if (deltas.length >= 30 && now - lastReport > 500) {
      lastReport = now
      const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length
      const fps = 1000 / avg
      if (fps < 45) {
        highSince = null
        lowSince ??= now
        if (now - lowSince > 3000 && level < 2) {
          level = (level + 1) as PerfLevel
          lowSince = null
          onLevel(level, fps)
        }
      } else if (fps > 55) {
        lowSince = null
        highSince ??= now
        if (now - highSince > 10000 && level > 0) {
          level = (level - 1) as PerfLevel
          highSince = null
          onLevel(level, fps)
        }
      } else {
        lowSince = null
        highSince = null
      }
    }
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
  const onVisibility = () => {
    deltas.length = 0
    last = performance.now()
  }
  document.addEventListener('visibilitychange', onVisibility)
  return () => {
    cancelAnimationFrame(raf)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}
