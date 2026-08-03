import { expect, test } from '@playwright/test'

const MAX_RENDERED_PANELS = 6
const ARROW_DOWN_PRESSES = 14
const STEP_WAIT_MS = 600

test('vertical feed: bounded DOM, single-step nav, seamless append', async ({
	page,
}) => {
	await page.goto('/feed')

	const panels = page.locator('[data-testid="feed-panel"]')
	await expect(panels.first()).toBeVisible()

	// renderOnlyVisible should keep the DOM small even as pages are appended.
	await expect
		.poll(() => panels.count())
		.toBeLessThanOrEqual(MAX_RENDERED_PANELS)

	for (let i = 0; i < ARROW_DOWN_PRESSES; i++) {
		await page.keyboard.press('ArrowDown')
		await page.waitForTimeout(STEP_WAIT_MS)
	}

	const activePanel = page.locator('[data-active="true"]')
	await expect(activePanel).toBeVisible()
	await expect(activePanel).toContainText('Видео #15')

	// Still bounded after 14 single-step advances — proves auto-append (items
	// 11-15 come from page 2, fetched past the SSR-prefetched first 10) landed
	// without blowing up the rendered panel count or desyncing the index.
	await expect
		.poll(() => panels.count())
		.toBeLessThanOrEqual(MAX_RENDERED_PANELS)

	const videos = page.locator('video')
	await expect(videos).toHaveCount(1)
	await expect(page.locator('[data-active="true"] video')).toHaveCount(1)
})
