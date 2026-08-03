import { infiniteQueryOptions } from '@tanstack/react-query'
import { feedPageSchema } from '../model/media-item.schema'

export const FEED_PAGE_LIMIT = 10

export const feedQueryKey = ['feed'] as const

export function feedInfiniteOptions() {
	return infiniteQueryOptions({
		queryKey: feedQueryKey,
		queryFn: async ({ pageParam, signal }) => {
			const res = await fetch(
				`/api/feed?cursor=${pageParam}&limit=${FEED_PAGE_LIMIT}`,
				{ signal },
			)
			if (!res.ok) throw new Error(`Feed request failed: ${res.status}`)
			return feedPageSchema.parse(await res.json())
		},
		initialPageParam: 0,
		getNextPageParam: (lastPage) => lastPage.nextCursor,
	})
}
