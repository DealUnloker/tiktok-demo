import { playerPool } from '@/features/media-playback/model/player-pool'

export type FeedItemLike = {
	index: number
	hlsUrl: string
	startSec?: number
}

type PreloadEntry = { index: number; src: string; startSec?: number }

// Local shape aligned with PlayerPool's public API — kept separate so tests
// can pass a plain mock object without importing the real pool.
export type PreloadTarget = {
	ensureActive(entry: PreloadEntry): void
	applyWindow(input: { active: PreloadEntry; warm: PreloadEntry[] }): void
	setAutoLevelCap(cap: number): void
}

// hls.js's Network Information consultation is Chromium-only and untyped in
// lib.dom.
interface NetworkInformationLike {
	saveData?: boolean
	effectiveType?: string
}

type NetworkBudget = 'normal' | 'data-saver'

const SETTLE_DEBOUNCE_MS = 100
const SLOW_EFFECTIVE_TYPES = new Set(['slow-2g', '2g', '3g'])

function getNetworkBudget(): NetworkBudget {
	if (typeof navigator === 'undefined') return 'normal'
	const connection = (
		navigator as Navigator & { connection?: NetworkInformationLike }
	).connection
	if (!connection) return 'normal'
	if (connection.saveData === true) return 'data-saver'
	if (
		connection.effectiveType &&
		SLOW_EFFECTIVE_TYPES.has(connection.effectiveType)
	) {
		return 'data-saver'
	}
	return 'normal'
}

export class PreloadManager {
	private settleTimer: ReturnType<typeof setTimeout> | null = null
	private prefetchedUrls = new Set<string>()
	private prefetchAbortController: AbortController | null = null

	constructor(private readonly pool: PreloadTarget) {}

	update(input: {
		activeIndex: number
		items: FeedItemLike[]
		settled: boolean
	}): void {
		const { activeIndex, items, settled } = input
		const active = items[activeIndex]
		if (!active) return

		this.pool.ensureActive({
			index: active.index,
			src: active.hlsUrl,
			startSec: active.startSec,
		})

		if (this.settleTimer !== null) {
			clearTimeout(this.settleTimer)
			this.settleTimer = null
		}

		if (!settled) return

		this.settleTimer = setTimeout(() => {
			this.settleTimer = null
			this.onSettled(activeIndex, items, active)
		}, SETTLE_DEBOUNCE_MS)
	}

	destroy(): void {
		if (this.settleTimer !== null) {
			clearTimeout(this.settleTimer)
			this.settleTimer = null
		}
		this.prefetchAbortController?.abort()
		this.prefetchAbortController = null
	}

	private onSettled(
		activeIndex: number,
		items: FeedItemLike[],
		active: FeedItemLike,
	): void {
		const budget = getNetworkBudget()
		this.pool.setAutoLevelCap(budget === 'data-saver' ? 0 : -1)

		const warm: PreloadEntry[] =
			budget === 'data-saver'
				? []
				: [activeIndex + 1, activeIndex - 1]
						.map((index) => items[index])
						.filter((item): item is FeedItemLike => Boolean(item))
						.map((item) => ({
							index: item.index,
							src: item.hlsUrl,
							startSec: item.startSec,
						}))

		this.pool.applyWindow({
			active: {
				index: active.index,
				src: active.hlsUrl,
				startSec: active.startSec,
			},
			warm,
		})

		if (budget !== 'normal') return

		const controller = this.ensurePrefetchController()
		for (const index of [activeIndex + 2, activeIndex - 2]) {
			const item = items[index]
			if (!item) continue
			this.prefetch(item.hlsUrl, controller.signal)
		}
	}

	private ensurePrefetchController(): AbortController {
		if (!this.prefetchAbortController) {
			this.prefetchAbortController = new AbortController()
		}
		return this.prefetchAbortController
	}

	private prefetch(url: string, signal: AbortSignal): void {
		if (this.prefetchedUrls.has(url)) return
		this.prefetchedUrls.add(url)
		fetch(url, { signal, mode: 'cors' }).catch(() => {
			// A failed or aborted prefetch (including one aborted by our own
			// destroy() on unmount) didn't actually warm anything — drop it
			// from the dedupe set so a future remount/settle retries it,
			// instead of marking it "done" forever.
			this.prefetchedUrls.delete(url)
		})
	}
}

export const preloadManager = new PreloadManager(playerPool)
