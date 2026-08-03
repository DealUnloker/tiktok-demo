'use client'

import { useMemo, useRef } from 'react'
import type { MediaItem } from '@/entities/media-item/model/media-item.schema'
import { usePanelPlayer } from '@/features/media-playback/lib/use-panel-player'
import { playerPool } from '@/features/media-playback/model/player-pool'
import { PanelSpinner } from '@/features/media-playback/ui/panel-spinner'
import { PlayerOverlay } from '@/features/media-playback/ui/player-overlay'
import { PanelActions } from './panel-actions'

type FeedPanelProps = {
	item: MediaItem
	isActive: boolean
	// Neighbor panels mount their warmed pool element paused, so the first
	// frame is already on screen while the swipe gesture is in flight.
	isNeighbor?: boolean
}

export function FeedPanel({
	item,
	isActive,
	isNeighbor = false,
}: FeedPanelProps) {
	const slotRef = useRef<HTMLDivElement>(null)

	const withVideo = isActive || isNeighbor
	const entry = useMemo(
		() =>
			withVideo
				? {
						index: item.index,
						src: item.hlsUrl,
						startSec: item.startSec,
					}
				: null,
		[withVideo, item.index, item.hlsUrl, item.startSec],
	)
	const { status, retry } = usePanelPlayer(entry, slotRef, isActive)

	return (
		<div
			className='flex h-full w-full justify-center overflow-hidden bg-black md:bg-neutral-900'
			data-testid='feed-panel'
			data-active={isActive}
		>
			{/* TikTok-style column: full-bleed on mobile, a centered 9:16
			    strip over a slightly softer dark backdrop on desktop. */}
			<div className='relative h-full w-full bg-black md:aspect-[9/16] md:w-auto'>
				{withVideo ? (
					<div
						ref={slotRef}
						className='absolute inset-0 h-full w-full'
					/>
				) : null}
				{isActive ? (
					<button
						type='button'
						data-tap-layer=''
						// A pointer-only utility surface: out of the tab
						// order (keyboard pause is the global Space hotkey),
						// never paints a focus ring around the whole video,
						// and drops any focus a mouse click parks on it —
						// otherwise the next arrow key flips the giant
						// button to :focus-visible (white outline).
						tabIndex={-1}
						className='absolute inset-0 outline-none focus-visible:outline-none'
						onClick={(event) => {
							playerPool.togglePlayPause()
							event.currentTarget.blur()
						}}
						aria-label={
							status === 'paused' ? 'Продолжить' : 'Пауза'
						}
					/>
				) : null}
				{withVideo && status === 'loading' ? <PanelSpinner /> : null}
				{isActive ? (
					<PlayerOverlay status={status} onRetry={retry} />
				) : null}
				{isActive ? (
					<div className='pointer-events-none absolute right-3 bottom-24'>
						<PanelActions item={item} />
					</div>
				) : null}
				{/* pointer-events-none: the gradient band overlaps the action
				    buttons — it must never intercept their clicks. */}
				<div className='pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-16 pr-20'>
					<p className='font-semibold text-white'>{item.title}</p>
					<p className='text-sm text-white/80'>{item.author.name}</p>
					<p className='mt-1 line-clamp-2 text-sm text-white/60'>
						{item.description}
					</p>
				</div>
			</div>
		</div>
	)
}
