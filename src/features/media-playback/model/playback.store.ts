import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type PlaybackState = {
	muted: boolean
	setMuted: (muted: boolean) => void
	toggleMute: () => void
}

export const usePlaybackStore = create<PlaybackState>()(
	persist(
		(set, get) => ({
			muted: true,
			setMuted: (muted) => set({ muted }),
			toggleMute: () => set({ muted: !get().muted }),
		}),
		{
			name: 'playback-preferences',
		},
	),
)
