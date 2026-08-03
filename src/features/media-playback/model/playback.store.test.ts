import { beforeEach, describe, expect, it } from 'vitest'
import { usePlaybackStore } from './playback.store'

beforeEach(() => {
	usePlaybackStore.setState({ muted: true, volume: 0.5 })
})

describe('playback store', () => {
	it('defaults volume to 50%', () => {
		expect(usePlaybackStore.getState().volume).toBe(0.5)
	})

	it('setVolume clamps to 0..1', () => {
		usePlaybackStore.getState().setVolume(1.7)
		expect(usePlaybackStore.getState().volume).toBe(1)
		usePlaybackStore.getState().setVolume(-3)
		expect(usePlaybackStore.getState().volume).toBe(0)
	})

	it('dragging volume to zero mutes; dragging up unmutes', () => {
		usePlaybackStore.getState().setVolume(0)
		expect(usePlaybackStore.getState().muted).toBe(true)

		usePlaybackStore.getState().setVolume(0.3)
		expect(usePlaybackStore.getState().muted).toBe(false)
		expect(usePlaybackStore.getState().volume).toBe(0.3)
	})

	it('unmuting at zero volume restores the 50% default', () => {
		usePlaybackStore.setState({ muted: true, volume: 0 })
		usePlaybackStore.getState().toggleMute()
		expect(usePlaybackStore.getState().muted).toBe(false)
		expect(usePlaybackStore.getState().volume).toBe(0.5)
	})

	it('plain toggle keeps the volume', () => {
		usePlaybackStore.setState({ muted: false, volume: 0.8 })
		usePlaybackStore.getState().toggleMute()
		expect(usePlaybackStore.getState()).toMatchObject({
			muted: true,
			volume: 0.8,
		})
	})
})
