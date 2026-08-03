import { expect, test } from '@playwright/test'

const MAX_RENDERED_PANELS = 8
// Active panel + warmed neighbors premounted with their first frame.
const MAX_VIDEO_ELEMENTS = 3
const ARROW_DOWN_PRESSES = 14
const STEP_WAIT_MS = 800

test('vertical feed: bounded DOM, single-step nav, seamless append', async ({
	page,
}) => {
	await page.goto('/')

	const panels = page.locator('[data-testid="feed-panel"]')
	await expect(panels.first()).toBeVisible()

	// Spacer virtualization keeps the DOM small even as pages are appended.
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

	// Pool budget: the active panel plays, direct neighbors are premounted
	// paused — never more than the pool allows, exactly one in the active.
	await expect
		.poll(() => page.locator('video').count())
		.toBeLessThanOrEqual(MAX_VIDEO_ELEMENTS)
	await expect(page.locator('[data-active="true"] video')).toHaveCount(1)
})
