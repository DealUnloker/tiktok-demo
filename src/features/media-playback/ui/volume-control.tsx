'use client'

import { Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { usePlaybackStore } from '@/features/media-playback/model/playback.store'
import { Button } from '@/shared/ui/button'
import { Slider } from '@/shared/ui/slider'

// Mute toggle + vertical volume slider (default 50%). Dragging to zero
// mutes, dragging up from zero unmutes — the store keeps them linked.
//
// UX guards (the YouTube-player pattern):
// - an enlarged invisible hit zone around the capsule keeps the hover open
//   and swallows near-miss clicks so they never reach the tap-to-pause layer;
// - every input inside the zone (pointer, wheel, keys) is isolated from the
//   feed — dragging the slider must not scroll it, arrow keys must not
//   change panels, and the wheel adjusts volume instead of scrolling.
export function VolumeControl() {
	const muted = usePlaybackStore((state) => state.muted)
	const volume = usePlaybackStore((state) => state.volume)
	const toggleMute = usePlaybackStore((state) => state.toggleMute)
	const setVolume = usePlaybackStore((state) => state.setVolume)

	const zoneRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const zone = zoneRef.current
		if (!zone) return

		// Native listeners, and CAREFUL: a blanket stopPropagation also kills
		// React's own root-delegated events — the slider and the button would
		// go dead. So: swallow only near-miss presses on the zone's padding
		// (they must not turn into feed gestures), and let everything
		// targeting the real controls bubble normally (Base UI
		// pointer-captures its drag, and its `touch-none` control keeps
		// native touch scrolling out).
		const stopIfMiss = (event: Event) => {
			const target = event.target as HTMLElement | null
			if (target?.closest('button, [data-slot=slider]')) return
			event.stopPropagation()
		}
		const onWheel = (event: WheelEvent) => {
			event.stopPropagation()
			event.preventDefault()
			const state = usePlaybackStore.getState()
			const base = state.muted ? 0 : state.volume
			state.setVolume(base + (event.deltaY > 0 ? -0.05 : 0.05))
		}

		const pressEvents = ['pointerdown', 'mousedown', 'touchstart'] as const
		for (const name of pressEvents) {
			zone.addEventListener(name, stopIfMiss)
		}
		zone.addEventListener('wheel', onWheel, { passive: false })

		return () => {
			for (const name of pressEvents) {
				zone.removeEventListener(name, stopIfMiss)
			}
			zone.removeEventListener('wheel', onWheel)
		}
	}, [])

	const shownVolume = muted ? 0 : Math.round(volume * 100)

	return (
		// Negative margins cancel the padding visually: the capsule stays in
		// place while the interactive zone extends ~16-24px beyond it.
		<div
			ref={zoneRef}
			data-volume-zone=''
			className='group -m-4 -mb-6 pointer-events-auto p-4 pb-6'
		>
			<div className='flex flex-col items-center rounded-full bg-black/60 p-1.5'>
				<Button
					variant='ghost'
					size='icon'
					className='rounded-full text-white hover:bg-white/15 hover:text-white'
					onClick={toggleMute}
					aria-label={muted ? 'Включить звук' : 'Выключить звук'}
				>
					{muted ? <VolumeX /> : <Volume2 />}
				</Button>
				{/* Mobile: the button is a plain mute toggle. Desktop: the
				    slider unfolds on hover/keyboard focus. */}
				<div className='grid h-0 place-items-center overflow-hidden opacity-0 transition-all duration-200 md:group-has-[:focus-visible]:h-24 md:group-has-[:focus-visible]:opacity-100 md:group-hover:h-24 md:group-hover:opacity-100'>
					<div className='flex h-20 items-center'>
						<Slider
							orientation='vertical'
							min={0}
							max={100}
							step={1}
							value={[shownVolume]}
							onValueChange={(value) => {
								const next = Array.isArray(value)
									? value[0]
									: value
								setVolume(
									(typeof next === 'number' ? next : 0) / 100,
								)
							}}
							className='[&_[data-slot=slider-range]]:bg-white [&_[data-slot=slider-track]]:bg-white/30'
							aria-label='Громкость'
						/>
					</div>
				</div>
			</div>
		</div>
	)
}
