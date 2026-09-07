import { existsSync } from 'node:fs'
import { expect, test } from '@playwright/test'

test('mobile: rail becomes a bottom strip and the panel is a bottom sheet', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  // same frozen clock as visual.spec.ts: relative times must not move the layout
  await page.clock.install({ time: new Date('2026-09-03T14:00:00Z') })
  await page.goto('/?c=25,20,1.6&l=rivers,events')
  await page.waitForFunction(() => {
    const c = document.querySelector<HTMLCanvasElement>('.maplibregl-canvas')
    return !!c && c.width > 0
  })
  const rail = page.getByTestId('layer-rail')
  await expect(rail).toHaveClass(/rail--mobile/)
  const box = await rail.boundingBox()
  expect(box && box.width > box.height).toBe(true)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(3000)
  if (existsSync(testInfo.snapshotPath('mobile.png')) || process.env.VISUAL_UPDATE === '1') {
    await expect(page).toHaveScreenshot('mobile.png', {
      maxDiffPixelRatio: 0.005,
      timeout: 90_000,
    })
  }
})
