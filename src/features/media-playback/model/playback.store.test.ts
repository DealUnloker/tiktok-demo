import { beforeEach, describe, expect, it } from 'vitest'

// This sandbox's node/jsdom combo exposes a `localStorage` global without a
// working backing store (`setItem` throws), which breaks zustand's persist
// middleware. Stub it with an in-memory Map before the store module loads.
function installMemoryLocalStorage() {
	const store = new Map<string, string>()
	Object.defineProperty(window, 'localStorage', {
		configurable: true,
		value: {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => {
				store.set(key, value)
			},
			removeItem: (key: string) => {
				store.delete(key)
			},
			clear: () => store.clear(),
		},
	})
}

async function loadStore() {
	const { usePlaybackStore } = await import('./playback.store')
	usePlaybackStore.setState({ muted: true, volume: 0.5 })
	return usePlaybackStore
}

beforeEach(() => {
	installMemoryLocalStorage()
})

describe('playback store', () => {
	it('defaults volume to 50%', async () => {
		const store = await loadStore()
		expect(store.getState().volume).toBe(0.5)
	})

	it('setVolume clamps to 0..1', async () => {
		const store = await loadStore()
		store.getState().setVolume(1.7)
		expect(store.getState().volume).toBe(1)
		store.getState().setVolume(-3)
		expect(store.getState().volume).toBe(0)
	})

	it('dragging volume to zero mutes; dragging up unmutes', async () => {
		const store = await loadStore()
		store.getState().setVolume(0)
		expect(store.getState().muted).toBe(true)

		store.getState().setVolume(0.3)
		expect(store.getState().muted).toBe(false)
		expect(store.getState().volume).toBe(0.3)
	})

	it('unmuting at zero volume restores the 50% default', async () => {
		const store = await loadStore()
		store.setState({ muted: true, volume: 0 })
		store.getState().toggleMute()
		expect(store.getState().muted).toBe(false)
		expect(store.getState().volume).toBe(0.5)
	})

	it('plain toggle keeps the volume', async () => {
		const store = await loadStore()
		store.setState({ muted: false, volume: 0.8 })
		store.getState().toggleMute()
		expect(store.getState()).toMatchObject({
			muted: true,
			volume: 0.8,
		})
	})
})
