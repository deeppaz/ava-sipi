import { existsSync } from 'node:fs'
import { expect, type Page, type TestInfo, test } from '@playwright/test'

/**
 * Visual regression (spec §8): six fixed views, ≤ 0.5 % pixel difference.
 * Reduced motion is forced so the flow animation and pulses are frozen.
 */
/**
 * Baselines are GPU/OS specific. Without one for this platform the test is skipped unless
 * VISUAL_UPDATE=1, which writes it (run once per CI image and commit the *-snapshots folder).
 */
/** ≤ 0.5 % diff (spec §8). The CI runner draws on SwiftShader, where a zoomed view with the river
 * network can take tens of seconds to settle before a stable capture is possible. */
const SHOT = { maxDiffPixelRatio: 0.005, timeout: 90_000 } as const

function requireBaseline(testInfo: TestInfo, name: string) {
  test.skip(
    !existsSync(testInfo.snapshotPath(name)) && process.env.VISUAL_UPDATE !== '1',
    `no baseline for ${name} on this platform`,
  )
}

async function settle(page: Page, url: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(url)
  await page.waitForFunction(() => {
    const c = document.querySelector<HTMLCanvasElement>('.maplibregl-canvas')
    return !!c && c.width > 0
  })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(4000)
}

test('globe far', async ({ page }, testInfo) => {
  requireBaseline(testInfo, 'globe-far.png')
  await settle(page, '/?c=25,20,1.6&l=rivers,gauges,events')
  await expect(page).toHaveScreenshot('globe-far.png', SHOT)
})

test('euphrates close', async ({ page }, testInfo) => {
  requireBaseline(testInfo, 'euphrates-close.png')
  await settle(page, '/?c=36,39.5,6&l=rivers,gauges,events')
  await expect(page).toHaveScreenshot('euphrates-close.png', SHOT)
})

test('panel open', async ({ page }, testInfo) => {
  requireBaseline(testInfo, 'panel-open.png')
  await settle(page, '/?c=36.15,-114.4,8&l=rivers,reservoirs,events')
  await page.getByTestId('pulse-line').click()
  await page.locator('.panel__list .panel__link').first().click()
  await page.waitForTimeout(1500)
  await expect(page).toHaveScreenshot('panel-open.png', SHOT)
})

test('story step', async ({ page }, testInfo) => {
  requireBaseline(testInfo, 'story-step.png')
  await settle(page, '/?story=aral&step=1&c=45,59.5,5.4')
  await expect(page).toHaveScreenshot('story-step.png', SHOT)
})

test('reduced motion legend', async ({ page }, testInfo) => {
  requireBaseline(testInfo, 'reduced-motion-legend.png')
  await settle(page, '/?c=25,20,1.6&l=rivers')
  await page.getByRole('button', { name: /legend|gösterge|nîşane/i }).click()
  await expect(page).toHaveScreenshot('reduced-motion-legend.png', SHOT)
})
