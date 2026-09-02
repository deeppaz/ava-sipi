#!/usr/bin/env node
/**
 * Captures README media from the built app (spec §9):
 *   - docs/media/og.png            1200×630 social image
 *   - docs/media/frames/*.png      GIF frames: globe → Euphrates → flood pulse → GRACE slider
 * Assemble the GIF with `python scripts/make_gif.py` (Pillow). Needs `vite preview` running on
 * 127.0.0.1:4173 (the script starts one when it is not).
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { chromium } from '@playwright/test'

const BASE = 'http://127.0.0.1:4173'
const out = new URL('../../../docs/media/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const frames = `${out}frames/`
mkdirSync(out, { recursive: true })
if (existsSync(frames)) rmSync(frames, { recursive: true })
mkdirSync(frames)

async function alive() {
  try {
    const r = await fetch(`${BASE}/`)
    return r.ok
  } catch {
    return false
  }
}
let server
if (!(await alive())) {
  server = spawn('pnpm', ['exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { stdio: 'ignore', shell: true })
  for (let i = 0; i < 40 && !(await alive()); i++) await new Promise((r) => setTimeout(r, 500))
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const waitGlobe = async (page) => {
  await page.waitForFunction(() => {
    const c = document.querySelector('.maplibregl-canvas')
    return !!c && c.width > 0
  })
  // embed mode hides the top bar; the pulse line only exists in the full shell
  if (await page.getByTestId('pulse-line').count()) await page.getByTestId('pulse-line').waitFor()
}

// ---- og.png
{
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${BASE}/?c=28,32,1.75&l=rivers,gauges,events&embed=1`)
  await waitGlobe(page)
  await page.waitForTimeout(6000)
  await page.screenshot({ path: `${out}og.png` })
  await page.close()
  console.log('og.png written')
}

// ---- GIF frames (800×500, ~15 s at 4 fps → 60 frames)
{
  const page = await browser.newPage({ viewport: { width: 800, height: 500 }, deviceScaleFactor: 1 })
  await page.goto(`${BASE}/?c=25,20,1.6&l=rivers,gauges,events`)
  await waitGlobe(page)
  await page.waitForTimeout(4000)
  let n = 0
  const shot = async () => {
    await page.screenshot({ path: `${frames}${String(n++).padStart(3, '0')}.png` })
  }
  // 1. globe turning (intro rotation is running)
  for (let i = 0; i < 14; i++) {
    await shot()
    await page.waitForTimeout(250)
  }
  // 2. fly to the Euphrates
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('ava:flyto', { detail: { lon: 39.5, lat: 36, zoom: 5.6 } })))
  for (let i = 0; i < 16; i++) {
    await shot()
    await page.waitForTimeout(250)
  }
  // 3. open the event list → first event (pulse + panel)
  await page.getByTestId('pulse-line').click()
  await page.locator('.panel__list .panel__link').first().click()
  for (let i = 0; i < 14; i++) {
    await shot()
    await page.waitForTimeout(250)
  }
  // 4. groundwater + time slider back in time
  await page.getByTestId('layer-groundwater').click()
  await page.keyboard.press('Escape')
  const range = page.getByTestId('timeline').getByRole('slider')
  await range.focus()
  for (let i = 0; i < 16; i++) {
    await page.keyboard.press('ArrowLeft')
    await shot()
    await page.waitForTimeout(120)
  }
  await page.close()
  console.log(`${n} frames written to ${frames}`)
}

await browser.close()
server?.kill()
process.exit(0)
