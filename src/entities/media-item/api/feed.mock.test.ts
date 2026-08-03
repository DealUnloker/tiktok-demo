import { describe, expect, it } from 'vitest'
import { feedPageSchema } from '../model/media-item.schema'
import { getFeedPage } from './feed.mock'

describe('getFeedPage', () => {
	it('is deterministic across calls', async () => {
		const first = await getFeedPage(0, 10)
		const second = await getFeedPage(0, 10)
		expect(first).toStrictEqual(second)
	})

	it('paginates the first page with sequential indexes and a next cursor', async () => {
		const page = await getFeedPage(0, 10)
		expect(page.items.map((item) => item.index)).toStrictEqual([
			0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
		])
		expect(page.nextCursor).toBe(10)
	})

	it('returns the last page with no next cursor, and an empty page past the end', async () => {
		const lastPage = await getFeedPage(1190, 10)
		expect(lastPage.items).toHaveLength(10)
		expect(lastPage.nextCursor).toBeNull()

		const beyondEnd = await getFeedPage(1200, 10)
		expect(beyondEnd.items).toStrictEqual([])
		expect(beyondEnd.nextCursor).toBeNull()
	})

	it('produces pages matching the schema', async () => {
		const page = await getFeedPage(0, 10)
		expect(() => feedPageSchema.parse(page)).not.toThrow()
	})
})
