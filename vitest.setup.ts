import '@testing-library/jest-dom/vitest'
import { beforeEach } from 'vitest'

// This sandbox's node/jsdom combination exposes a `localStorage` global
// without a working backing store (`setItem` throws), which breaks zustand's
// persist middleware. Install an in-memory replacement before every test so
// stores can be imported statically.
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

installMemoryLocalStorage()

beforeEach(() => {
	installMemoryLocalStorage()
})
