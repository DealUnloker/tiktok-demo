'use client'

import '@egjs/react-flicking/dist/flicking.css'

import type {
	ChangedEvent,
	MoveEndEvent,
	MoveStartEvent,
} from '@egjs/react-flicking'
import Flicking from '@egjs/react-flicking'
import { useInfiniteQuery } from '@tanstack/react-query'
import type { WheelEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { feedInfiniteOptions } from '@/entities/media-item/api/feed.options'
import { playerPool } from '@/features/media-playback/model/player-pool'
import { Skeleton } from '@/shared/ui/skeleton'
import { useFeedStore } from '../model/feed.store'
import { preloadManager } from '../model/preload-manager'
import { FeedPanel } from './feed-panel'

const SKELETON_KEYS = [
	'skeleton-1',
	'skeleton-2',
	'skeleton-3',
	'skeleton-4',
	'skeleton-5',
] as const

// How many unrendered panels may remain before we prefetch the next page.
const APPEND_THRESHOLD = 4

// Minimum time between wheel-triggered panel changes, so a single physical
// scroll gesture (many small wheel events) advances only one panel.
const WHEEL_COOLDOWN_MS = 700

export function VideoFeed() {
	const { data, isPending, fetchNextPage, hasNextPage, isFetchingNextPage } =
		useInfiniteQuery(feedInfiniteOptions())

	const [mounted, setMounted] = useState(false)
	// True initially: there's no gesture in flight on mount, so the first
	// neighbors should warm once the settle debounce fires.
	const [settled, setSettled] = useState(true)
	const flickingRef = useRef<Flicking>(null)
	const lastWheelAt = useRef(0)
	const activeIndex = useFeedStore((state) => state.activeIndex)

	useEffect(() => {
		setMounted(true)
	}, [])

	useEffect(() => {
		return () => {
			playerPool.destroy()
			preloadManager.destroy()
			// The store survives SPA navigation; without a reset a remounted
			// feed starts Flicking at panel 0 while activeIndex still points
			// at the old position — nothing plays until the first swipe.
			useFeedStore.getState().setActiveIndex(0)
		}
	}, [])

	const items = useMemo(
		() => data?.pages.flatMap((page) => page.items) ?? [],
		[data],
	)

	useEffect(() => {
		if (!mounted) return
		preloadManager.update({ activeIndex, items, settled })
	}, [mounted, activeIndex, items, settled])

	useEffect(() => {
		if (!mounted) return
		if (
			activeIndex >= items.length - APPEND_THRESHOLD &&
			hasNextPage &&
			!isFetchingNextPage
		) {
			fetchNextPage()
		}
	}, [
		mounted,
		activeIndex,
		items.length,
		hasNextPage,
		isFetchingNextPage,
		fetchNextPage,
	])

	useEffect(() => {
		if (!mounted) return

		function onKeyDown(e: KeyboardEvent) {
			if (e.key === 'ArrowDown' || e.key === 'PageDown') {
				e.preventDefault()
				flickingRef.current?.next().catch(() => {})
			} else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
				e.preventDefault()
				flickingRef.current?.prev().catch(() => {})
			}
		}

		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [mounted])

	if (isPending) {
		return (
			<div className='flex flex-col gap-3 p-4'>
				{SKELETON_KEYS.map((key) => (
					<Skeleton key={key} className='h-16 w-full' />
				))}
			</div>
		)
	}

	if (!mounted) {
		// Flicking measures the viewport on mount and briefly renders in the wrong
		// orientation right after hydration (naver/egjs-flicking#615). Render only
		// the static first panel until the effect flips `mounted` — SSR HTML shows
		// the poster, no Flicking markup at all.
		const firstItem = items[0]
		return firstItem ? (
			<FeedPanel item={firstItem} isActive={false} />
		) : null
	}

	function onWheel(e: WheelEvent) {
		const now = Date.now()
		if (now - lastWheelAt.current < WHEEL_COOLDOWN_MS) return
		lastWheelAt.current = now

		if (e.deltaY > 0) {
			flickingRef.current?.next().catch(() => {})
		} else if (e.deltaY < 0) {
			flickingRef.current?.prev().catch(() => {})
		}
	}

	return (
		<div
			className='h-dvh w-full overflow-hidden overscroll-contain'
			onWheel={onWheel}
		>
			<Flicking
				ref={flickingRef}
				className='h-full w-full'
				horizontal={false}
				panelsPerView={1}
				moveType={['strict', { count: 1 }]}
				renderOnlyVisible={true}
				onChanged={(e: ChangedEvent) => {
					useFeedStore.getState().setActiveIndex(e.index)
				}}
				onMoveStart={(_e: MoveStartEvent) => {
					setSettled(false)
				}}
				onMoveEnd={(_e: MoveEndEvent) => {
					setSettled(true)
				}}
			>
				{items.map((item, index) => (
					<FeedPanel
						key={item.id}
						item={item}
						isActive={index === activeIndex}
						isNeighbor={Math.abs(index - activeIndex) === 1}
					/>
				))}
			</Flicking>
		</div>
	)
}
