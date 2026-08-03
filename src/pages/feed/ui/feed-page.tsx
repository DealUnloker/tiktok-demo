import { dehydrate, HydrationBoundary } from '@tanstack/react-query'

import { getFeedPage } from '@/entities/media-item/api/feed.mock'
import {
	FEED_PAGE_LIMIT,
	feedQueryKey,
} from '@/entities/media-item/api/feed.options'
import { makeQueryClient } from '@/shared/api/query-client'
import { VideoFeed } from '@/widgets/video-feed/ui/video-feed'

export async function FeedPage() {
	const queryClient = makeQueryClient()

	await queryClient.prefetchInfiniteQuery({
		queryKey: feedQueryKey,
		queryFn: ({ pageParam }) => getFeedPage(pageParam, FEED_PAGE_LIMIT),
		initialPageParam: 0,
		getNextPageParam: (lastPage) => lastPage.nextCursor,
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
