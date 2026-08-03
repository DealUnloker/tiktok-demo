import type { Metadata } from 'next'
import { FeedPage } from '@/pages/feed/ui/feed-page'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
	title: 'Лента',
}

export default function Page() {
	return <FeedPage />
}
