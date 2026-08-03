import { dehydrate, HydrationBoundary } from '@tanstack/react-query'

import { getFeedPage } from '@/entities/media-item/api/feed.mock'
import {
	FEED_PAGE_LIMIT,
	feedInfiniteOptions,
} from '@/entities/media-item/api/feed.options'
import { makeQueryClient } from '@/shared/api/query-client'
import { VideoFeed } from '@/widgets/video-feed/ui/video-feed'

export async function FeedPage() {
	const queryClient = makeQueryClient()

	// Same options as the client query (key, cursor logic) with one server
	// substitution: call the generator directly instead of HTTP-ing ourselves.
	await queryClient.prefetchInfiniteQuery({
		...feedInfiniteOptions(),
		queryFn: ({ pageParam }) =>
			getFeedPage(pageParam, FEED_PAGE_LIMIT, { simulateLatency: false }),
		pages: 1,
	})

	return (
		<main className='h-dvh w-full overflow-hidden'>
			<HydrationBoundary state={dehydrate(queryClient)}>
				<VideoFeed />
			</HydrationBoundary>
		</main>
	)
}
