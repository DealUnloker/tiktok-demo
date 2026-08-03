'use client'

import { Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Button } from '@/shared/ui/button'
import { Slider } from '@/shared/ui/slider'
import { usePlaybackStore } from '../model/playback.store'

// Mute toggle + vertical volume slider (default 50%). Dragging to zero
// mutes, dragging up from zero unmutes — the store keeps them linked.
//
// UX guards (the YouTube-player pattern):
// - an enlarged invisible hit zone around the capsule keeps the hover open;
//   near-miss presses can't reach the feed anyway (the zone wins hit-testing,
//   and use-feed-drag cancels drags starting inside [data-volume-zone]);
// - the wheel adjusts volume instead of scrolling the feed — a native
//   passive:false listener, because React registers root wheel listeners
//   passively and a synthetic onWheel could not preventDefault;
// - arrow keys on the focused slider are kept from feed navigation by the
//   [data-volume-zone] guard in the feed's keydown handler.
export function VolumeControl() {
	const muted = usePlaybackStore((state) => state.muted)
	const volume = usePlaybackStore((state) => state.volume)
	const toggleMute = usePlaybackStore((state) => state.toggleMute)
	const setVolume = usePlaybackStore((state) => state.setVolume)

	const zoneRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const zone = zoneRef.current
		if (!zone) return

		const onWheel = (event: WheelEvent) => {
			event.stopPropagation()
			event.preventDefault()
			const state = usePlaybackStore.getState()
			const base = state.muted ? 0 : state.volume
			state.setVolume(base + (event.deltaY > 0 ? -0.05 : 0.05))
		}

		zone.addEventListener('wheel', onWheel, { passive: false })
		return () => zone.removeEventListener('wheel', onWheel)
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
				{/* Mobile: the button is a plain mute toggle and the slider is
				    fully removed (`hidden` keeps the invisible thumb out of
				    the tab order). Desktop: unfolds on hover/keyboard focus. */}
				<div className='hidden h-0 place-items-center overflow-hidden opacity-0 transition-all duration-200 md:grid md:group-has-[:focus-visible]:h-24 md:group-has-[:focus-visible]:opacity-100 md:group-hover:h-24 md:group-hover:opacity-100'>
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
								setVolume((next ?? 0) / 100)
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
