import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type PlaybackState = {
	muted: boolean
	// 0..1, default 50% — applied to every pooled element.
	volume: number
	setMuted: (muted: boolean) => void
	toggleMute: () => void
	// Volume and mute are linked the way players usually do it: dragging to
	// zero mutes, dragging up from zero unmutes.
	setVolume: (volume: number) => void
}

export const usePlaybackStore = create<PlaybackState>()(
	persist(
		(set, get) => ({
			muted: true,
			volume: 0.5,
			setMuted: (muted) => set({ muted }),
			toggleMute: () => {
				const { muted, volume } = get()
				// Unmuting at zero volume would stay silent — restore the 50%
				// default in that case.
				if (muted && volume === 0) {
					set({ muted: false, volume: 0.5 })
				} else {
					set({ muted: !muted })
				}
			},
			setVolume: (volume) => {
				const clamped = Math.min(1, Math.max(0, volume))
				set({ volume: clamped, muted: clamped === 0 })
			},
		}),
		{
			name: 'playback-preferences',
		},
	),
)
