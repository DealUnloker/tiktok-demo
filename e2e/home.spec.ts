import { expect, test } from '@playwright/test'

test('home page renders', async ({ page }) => {
	await page.goto('/')

	await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible()
})

test('unknown route renders the 404 page', async ({ page }) => {
	await page.goto('/definitely-not-a-page')

	await expect(page.getByRole('heading', { name: '404' })).toBeVisible()
	await expect(page.getByRole('link', { name: 'Go home' })).toBeVisible()
})
