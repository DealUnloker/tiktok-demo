'use client'

import type { Ref } from 'react'
import { useMemo, useRef } from 'react'
import type { MediaItem } from '@/entities/media-item/model/media-item.schema'
import { usePanelPlayer } from '@/features/media-playback/lib/use-panel-player'
import { PanelSpinner } from '@/features/media-playback/ui/panel-spinner'
import { PlayerOverlay } from '@/features/media-playback/ui/player-overlay'

type FeedPanelProps = {
	item: MediaItem
	isActive: boolean
	// Neighbor panels mount their warmed pool element paused, so the first
	// frame is already on screen while the swipe gesture is in flight.
	isNeighbor?: boolean
	// react-flicking's StrictPanel injects a ref to reach the panel's DOM node;
	// without forwarding it, the engine sees `element: null` and breaks layout.
	ref?: Ref<HTMLDivElement>
}

export function FeedPanel({
	item,
	isActive,
	isNeighbor = false,
	ref,
}: FeedPanelProps) {
	const slotRef = useRef<HTMLDivElement>(null)

	const withVideo = isActive || isNeighbor
	const entry = useMemo(
		() => (withVideo ? { index: item.index, src: item.hlsUrl } : null),
		[withVideo, item.index, item.hlsUrl],
	)
	const { status, retry } = usePanelPlayer(entry, slotRef, isActive)

	return (
		<div
			ref={ref}
			className='relative h-full w-full overflow-hidden bg-black'
			data-testid='feed-panel'
			data-active={isActive}
		>
			{withVideo ? (
				<div ref={slotRef} className='absolute inset-0 h-full w-full' />
			) : null}
			{withVideo && status === 'loading' ? <PanelSpinner /> : null}
			{isActive ? (
				<PlayerOverlay status={status} onRetry={retry} />
			) : null}
			<div className='absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-16'>
				<p className='font-semibold text-white'>{item.title}</p>
				<p className='text-sm text-white/80'>{item.author.name}</p>
			</div>
		</div>
	)
}
