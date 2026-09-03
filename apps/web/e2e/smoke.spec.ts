import { expect, type Page, test } from '@playwright/test'

/** Sample mode, reduced motion off; the globe must render and three layers must toggle (spec §8). */
async function waitForGlobe(page: Page) {
  await page.goto('/?c=25,20,1.6')
  await expect(page.getByTestId('map')).toBeVisible()
  await page.waitForFunction(() => {
    const c = document.querySelector<HTMLCanvasElement>('.maplibregl-canvas')
    return !!c && c.width > 0
  })
  // data layers loaded: pulse line mentions floods once events arrive
  await expect(page.getByTestId('pulse-line')).toContainText(/flood|sel|lehî/i, { timeout: 30_000 })
}

test('map container fills the stage (lazy maplibre css must not collapse it)', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('.maplibregl-canvas', { timeout: 30000 })
  const box = await page.locator('.map-root').boundingBox()
  const view = page.viewportSize()
  expect(box?.height ?? 0).toBeGreaterThan((view?.height ?? 0) * 0.9)
  expect(box?.width ?? 0).toBeGreaterThan((view?.width ?? 0) * 0.9)
})

test('globe loads, three layers toggle, panel opens from an event', async ({ page }) => {
  await waitForGlobe(page)
  const rail = page.getByTestId('layer-rail')
  await expect(rail).toBeVisible()
  for (const id of ['rivers', 'gauges', 'events']) {
    await expect(page.getByTestId(`layer-${id}`)).toHaveAttribute('aria-pressed', 'true')
  }
  await page.getByTestId('layer-reservoirs').click()
  await expect(page.getByTestId('layer-reservoirs')).toHaveAttribute('aria-pressed', 'true')
  await expect(page).toHaveURL(/l=rivers,gauges,events,reservoirs/)

  // open the events list from the pulse line and select the first event → panel is filled
  await page.getByTestId('pulse-line').click()
  const first = page.locator('.panel__list .panel__link').first()
  await expect(first).toBeVisible()
  await first.click()
  const panel = page.getByTestId('detail-panel')
  await expect(panel).toBeVisible()
  await expect(panel.locator('.panel__title')).not.toBeEmpty()
  await expect(panel).toContainText(/GDACS/)
  await expect(page).toHaveURL(/s=events:gdacs-/)
})

test('search flies to the Euphrates and the URL carries the view', async ({ page }) => {
  await waitForGlobe(page)
  const input = page.getByRole('combobox')
  await input.fill('Euphr')
  const option = page.getByRole('option').first()
  await expect(option).toBeVisible()
  await option.click()
  await expect(page).toHaveURL(/c=35\.5,40,5\.2/, { timeout: 10_000 })
})

test('command palette switches language and units', async ({ page }) => {
  await waitForGlobe(page)
  await page.keyboard.press('Control+k')
  const palette = page.getByTestId('palette')
  await expect(palette).toBeVisible()
  await palette.getByRole('textbox').fill('Türkçe')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('layer-rivers')).toHaveAttribute('aria-label', /nehirler/)
  await page.keyboard.press('Control+k')
  await palette.getByRole('textbox').fill('imperial')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('map')).toHaveAttribute('data-units', 'imperial')
})

test('time slider enters forecast and shows the watermark', async ({ page }) => {
  await waitForGlobe(page)
  const range = page.getByTestId('timeline').getByRole('slider')
  await range.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.watermark')).toBeVisible()
  await expect(page).toHaveURL(/t=f%2B1|t=f\+1/)
})

test('story mode steps with the keyboard', async ({ page }) => {
  await page.goto('/?story=euphrates-tigris&step=1&c=39.4,40.2,6.2')
  await expect(page.getByTestId('story')).toBeVisible()
  await expect(page.getByTestId('story')).toContainText(/1 \/ 5|Step 1 of 5|Gav 1/)
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('story')).toContainText(/2/)
  await expect(page).toHaveURL(/step=2/)
})
