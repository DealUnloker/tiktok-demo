import type { FeedPageData, MediaItem } from '../model/media-item.schema'

const TOTAL_ITEMS = 1200

// Only CORS-enabled sources: hls.js fetches manifests/segments via XHR, so
// every stream here must answer with `access-control-allow-origin` (Apple's
// devstreaming CDN, for example, does not and fails from the browser).
const STREAM_POOL = [
	{
		hlsUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
		durationSec: 634,
	},
	{
		hlsUrl: 'https://test-streams.mux.dev/tos_ismc/main.m3u8',
		durationSec: 734,
	},
	{
		hlsUrl: 'https://test-streams.mux.dev/test_001/stream.m3u8',
		durationSec: 30,
	},
	{
		hlsUrl: 'https://test-streams.mux.dev/pts_shift/master.m3u8',
		durationSec: 200,
	},
	{
		hlsUrl: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
		durationSec: 734,
	},
] as const

// Public CORS-enabled HLS test streams are scarce (a dozen exist, not 100+),
// so unique feed items are VIRTUAL CLIPS: the same streams cut by start
// position every CLIP_STEP_SEC. ~2300s of source footage → 100+ clips with
// distinct scenes. The player seeks to `startSec` (hls.js `startPosition`).
const CLIP_STEP_SEC = 20
// Don't start a clip closer than this to the end of the stream.
const CLIP_MIN_TAIL_SEC = 15

const VIRTUAL_CLIPS = STREAM_POOL.flatMap((stream) => {
	const clips: { hlsUrl: string; startSec: number; durationSec: number }[] =
		[]
	for (
		let start = 0;
		start + CLIP_MIN_TAIL_SEC <= stream.durationSec;
		start += CLIP_STEP_SEC
	) {
		clips.push({
			hlsUrl: stream.hlsUrl,
			startSec: start,
			durationSec: Math.min(CLIP_STEP_SEC, stream.durationSec - start),
		})
	}
	return clips
})

// Coprime stride scatters consecutive feed items across different streams and
// far-apart scenes, instead of walking one movie 20s at a time.
const CLIP_STRIDE = 7919

const AUTHOR_NAMES = [
	'Алиса Соколова',
	'Иван Петров',
	'Мария Кузнецова',
	'Дмитрий Волков',
	'Екатерина Морозова',
	'Сергей Новиков',
] as const

const DESCRIPTION_PHRASES = [
	'Снято на закате, невероятный свет',
	'Лучший момент этой недели',
	'Не могу перестать пересматривать',
	'Подписывайтесь, будет ещё',
	'Это заняло всего один дубль',
] as const

function hashLikes(index: number) {
	return (index * 2654435761) % 100_000
}

function buildMediaItem(index: number): MediaItem {
	const clip = VIRTUAL_CLIPS[(index * CLIP_STRIDE) % VIRTUAL_CLIPS.length]
	const authorName = AUTHOR_NAMES[index % AUTHOR_NAMES.length]
	const description = DESCRIPTION_PHRASES[index % DESCRIPTION_PHRASES.length]

	return {
		id: `media-${index}`,
		index,
		title: `Видео #${index + 1}`,
		description,
		hlsUrl: clip.hlsUrl,
		startSec: clip.startSec,
		posterUrl: null,
		durationSec: clip.durationSec,
		author: {
			name: authorName,
			avatarUrl: null,
		},
		likes: hashLikes(index),
	}
}

export async function getFeedPage(
	cursor = 0,
	limit = 10,
): Promise<FeedPageData> {
	const safeCursor = Math.max(0, cursor)
	const safeLimit = Math.max(0, limit)
	const end = Math.min(safeCursor + safeLimit, TOTAL_ITEMS)

	const items: MediaItem[] = []
	for (let index = safeCursor; index < end; index++) {
		items.push(buildMediaItem(index))
	}

	await new Promise((resolve) => setTimeout(resolve, 150))

	return {
		items,
		nextCursor: end < TOTAL_ITEMS ? end : null,
	}
}
