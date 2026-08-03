import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getFeedPage } from '@/entities/media-item/api/feed.mock'

const querySchema = z.object({
	cursor: z.coerce.number().int().nonnegative().default(0),
	limit: z.coerce.number().int().positive().max(20).default(10),
})

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url)
	const parsed = querySchema.safeParse(Object.fromEntries(searchParams))
	if (!parsed.success) {
		return NextResponse.json(
			{ error: 'Invalid query params' },
			{ status: 400 },
		)
	}
	const page = await getFeedPage(parsed.data.cursor, parsed.data.limit)
	return NextResponse.json(page)
}
