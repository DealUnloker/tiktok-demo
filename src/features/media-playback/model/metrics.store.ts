import { create } from 'zustand'

// Playback quality counters for the debug overlay (?debug=1). Fed by the
// player pool from the active element's media events.
type MetricsState = {
	// Time-to-first-frame of the most recently activated video.
	ttffMs: number | null
	rebufferCount: number
	rebufferMs: number
	droppedFrames: number
	reportTtff: (ms: number) => void
	reportRebuffer: (ms: number) => void
	reportDroppedFrames: (total: number) => void
}

export const useMetricsStore = create<MetricsState>((set) => ({
	ttffMs: null,
	rebufferCount: 0,
	rebufferMs: 0,
	droppedFrames: 0,
	reportTtff: (ms) => set({ ttffMs: Math.round(ms) }),
	reportRebuffer: (ms) =>
		set((state) => ({
			rebufferCount: state.rebufferCount + 1,
			rebufferMs: Math.round(state.rebufferMs + ms),
		})),
	reportDroppedFrames: (total) => set({ droppedFrames: total }),
}))
