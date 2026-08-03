import { describe, expect, it } from 'vitest'
import { GET } from '../../../../app/api/feed/route'

describe('GET /api/feed', () => {
	it('returns items and nextCursor for a valid query', async () => {
		const response = await GET(
			new Request('http://localhost/api/feed?cursor=10&limit=5'),
		)
		expect(response.status).toBe(200)

		const body = await response.json()
		expect(body.items).toHaveLength(5)
		expect(body.items[0].index).toBe(10)
		expect(body.nextCursor).toBe(15)
	})

	it('applies defaults when no query params are given', async () => {
		const response = await GET(new Request('http://localhost/api/feed'))
		expect(response.status).toBe(200)

		const body = await response.json()
		expect(body.items).toHaveLength(10)
		expect(body.items[0].index).toBe(0)
		expect(body.nextCursor).toBe(10)
	})

	it('rejects a negative cursor with 400', async () => {
		const response = await GET(
			new Request('http://localhost/api/feed?cursor=-1'),
		)
		expect(response.status).toBe(400)

		const body = await response.json()
		expect(body.error).toBe('Invalid query params')
	})

	it('rejects a limit above the maximum with 400', async () => {
		const response = await GET(
			new Request('http://localhost/api/feed?limit=999'),
		)
		expect(response.status).toBe(400)
	})

	it('rejects a non-numeric cursor with 400', async () => {
		const response = await GET(
			new Request('http://localhost/api/feed?cursor=abc'),
		)
		expect(response.status).toBe(400)
	})
})
