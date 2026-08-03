'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'

import { feedInfiniteOptions } from '@/entities/media-item/api/feed.options'
import { playerPool } from '@/features/media-playback/model/player-pool'
import { Skeleton } from '@/shared/ui/skeleton'
import { useFeedDrag } from '../lib/use-feed-drag'
import { preloadManager } from '../model/preload-manager'
import { DebugMetrics } from './debug-metrics'
import { FeedPanel } from './feed-panel'

// How many unrendered panels may remain before we prefetch the next page.
const APPEND_THRESHOLD = 4

// Panels rendered above/below the active one. Everything outside the window
// is two spacer divs — uniform 100dvh panels virtualize with no measurement.
const OVERSCAN = 3

// The feed mechanism is NATIVE browser scrolling with CSS scroll-snap
// (`snap-y snap-mandatory` + `snap-always`): trackpad/wheel inertia, touch
// physics, and snapping are all handled by the platform — zero gesture code.
// A JS engine (Flicking) was implemented first and dropped: it has no wheel
// support of its own, and every bridge needed hand-rolled inertia heuristics
// that misfired on macOS trackpads (see docs/PLAN.md for the full history).
export function VideoFeed() {
	const { data, isPending, fetchNextPage, hasNextPage, isFetchingNextPage } =
		useInfiniteQuery(feedInfiniteOptions())

	const scrollerRef = useRef<HTMLDivElement>(null)
	// True initially: no gesture is in flight on mount, so the first
	// neighbors warm up as soon as the preload debounce fires.
	const [settled, setSettled] = useState(true)
	// Plain component state: only this widget reads it, and it dies with the
	// component on navigation — no store, no reset ritual.
	const [activeIndex, setActiveIndex] = useState(0)

	useEffect(() => {
		return () => {
			playerPool.destroy()
			preloadManager.destroy()
		}
	}, [])

	const items = useMemo(
		() => data?.pages.flatMap((page) => page.items) ?? [],
		[data],
	)

	useEffect(() => {
		preloadManager.update({ activeIndex, items, settled })
	}, [activeIndex, items, settled])

	useEffect(() => {
		if (
			activeIndex >= items.length - APPEND_THRESHOLD &&
			hasNextPage &&
			!isFetchingNextPage
		) {
			fetchNextPage()
		}
	}, [
		activeIndex,
		items.length,
		hasNextPage,
		isFetchingNextPage,
		fetchNextPage,
	])

	// Active index tracks the native scroll position; "settled" comes from
	// the `scrollend` event with a debounce fallback for engines without it.
	useEffect(() => {
		const el = scrollerRef.current
		if (!el) return

		let debounce: ReturnType<typeof setTimeout> | null = null
		const onScroll = () => {
			const panelHeight = el.clientHeight
			if (panelHeight > 0) {
				const index = Math.round(el.scrollTop / panelHeight)
				// Functional update bails out when the index is unchanged.
				setActiveIndex((prev) => (prev === index ? prev : index))
			}
			setSettled(false)
			if (debounce) clearTimeout(debounce)
			debounce = setTimeout(() => setSettled(true), 150)
		}
		const onScrollEnd = () => {
			if (debounce) clearTimeout(debounce)
			setSettled(true)
		}

		el.addEventListener('scroll', onScroll, { passive: true })
		el.addEventListener('scrollend', onScrollEnd)
		return () => {
			el.removeEventListener('scroll', onScroll)
			el.removeEventListener('scrollend', onScrollEnd)
			if (debounce) clearTimeout(debounce)
		}
	}, [])

	useFeedDrag(scrollerRef)

	// Keyboard: smooth-scroll one panel; the browser snaps onto it.
	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			// Keyboard focus inside the volume zone: arrows belong to the
			// slider (Base UI handles them), not to feed navigation.
			if (
				e.target instanceof Element &&
				e.target.closest('[data-volume-zone]')
			) {
				return
			}
			const el = scrollerRef.current
			if (!el) return
			if (e.key === 'ArrowDown' || e.key === 'PageDown') {
				e.preventDefault()
				el.scrollBy({ top: el.clientHeight, behavior: 'smooth' })
			} else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
				e.preventDefault()
				el.scrollBy({ top: -el.clientHeight, behavior: 'smooth' })
			} else if (e.key === ' ') {
				// The video-player standard: Space toggles pause. Skip when
				// focus sits on a real control (it would click it instead).
				if (
					e.target instanceof Element &&
					e.target.closest('button:not([data-tap-layer]), a, input')
				) {
					return
				}
				e.preventDefault()
				playerPool.togglePlayPause()
			}
		}

		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [])

	if (isPending) {
		// Full-bleed dark splash matching the feed itself — reachable only on
		// a client-side remount without hydrated data.
		return (
			<div className='flex h-dvh w-full items-center justify-center bg-black'>
				<Skeleton className='size-14 rounded-full bg-white/10' />
			</div>
		)
	}

	const renderStart = Math.max(0, activeIndex - OVERSCAN)
	const renderEnd = Math.min(items.length, activeIndex + OVERSCAN + 1)
	const windowItems = items.slice(renderStart, renderEnd)
	const trailingCount = items.length - renderEnd

	return (
		<div
			ref={scrollerRef}
			className='h-dvh w-full touch-pan-y snap-y snap-mandatory select-none overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
			data-testid='feed-scroller'
		>
			<DebugMetrics />
			{renderStart > 0 ? (
				<div
					aria-hidden
					style={{ height: `${renderStart * 100}dvh` }}
				/>
			) : null}
			{windowItems.map((item, i) => {
				const index = renderStart + i
				return (
					<div
						key={item.id}
						className='h-dvh w-full snap-start snap-always'
					>
						<FeedPanel
							item={item}
							isActive={index === activeIndex}
							isNeighbor={Math.abs(index - activeIndex) === 1}
						/>
					</div>
				)
			})}
			{trailingCount > 0 ? (
				<div
					aria-hidden
					style={{ height: `${trailingCount * 100}dvh` }}
				/>
			) : null}
		</div>
	)
}
