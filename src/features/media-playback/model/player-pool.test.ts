import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { hlsInstances, MockHls } = vi.hoisted(() => {
	const instances: Array<{
		config: Record<string, unknown>
		loadSource: ReturnType<typeof vi.fn>
		attachMedia: ReturnType<typeof vi.fn>
		destroy: ReturnType<typeof vi.fn>
		startLoad: ReturnType<typeof vi.fn>
		stopLoad: ReturnType<typeof vi.fn>
		on: ReturnType<typeof vi.fn>
		recoverMediaError: ReturnType<typeof vi.fn>
		autoLevelCapping: number
	}> = []

	class MockHlsCtor {
		static isSupported = () => true
		static Events = { ERROR: 'hlsError' }
		static ErrorTypes = {
			NETWORK_ERROR: 'networkError',
			MEDIA_ERROR: 'mediaError',
			OTHER_ERROR: 'otherError',
		}
		recoverMediaError = vi.fn()
		config: Record<string, unknown>
		loadSource = vi.fn()
		attachMedia = vi.fn()
		destroy = vi.fn()
		startLoad = vi.fn()
		stopLoad = vi.fn()
		on = vi.fn()
		autoLevelCapping = -1

		constructor(config: Record<string, unknown>) {
			this.config = config
			instances.push(this)
		}
	}

	return { hlsInstances: instances, MockHls: MockHlsCtor }
})

vi.mock('hls.js', () => ({
	default: MockHls,
}))

beforeEach(async () => {
	hlsInstances.length = 0
	HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
	HTMLMediaElement.prototype.pause = vi.fn()
	HTMLMediaElement.prototype.load = vi.fn()
	// Prime the module cache: two `import('hls.js')` calls fired in the same
	// tick (one per slot attached) can otherwise race Vitest's mock
	// registration and have the second resolve to the real module instead of
	// the mock. Resolving it once up front avoids that.
	await import('hls.js')
	hlsInstances.length = 0
})

afterEach(() => {
	vi.restoreAllMocks()
})

async function flush() {
	// The pool's attach() awaits a dynamic `import('hls.js')`, which under
	// Vite/vitest's module loader resolves on a real timer tick rather than a
	// plain microtask — a chain of `Promise.resolve()` isn't enough to
	// observe it settle, so wait on an actual macrotask instead.
	await new Promise((resolve) => setTimeout(resolve, 0))
	await new Promise((resolve) => setTimeout(resolve, 0))
	await Promise.resolve()
}

type TestSlot = {
	element: HTMLVideoElement
	index: number | null
	hls: (typeof hlsInstances)[number] | null
}

function getSlots(pool: unknown): TestSlot[] {
	// biome-ignore lint/suspicious/noExplicitAny: reaching into private slots for the test
	return (pool as any).slots as TestSlot[]
}

type HlsErrorHandler = (event: string, data: Record<string, unknown>) => void

function getErrorHandler(hls: (typeof hlsInstances)[number]): HlsErrorHandler {
	const handler = hls.on.mock.calls.find(
		([event]) => event === 'hlsError',
	)?.[1]
	if (!handler) throw new Error('hlsError handler not registered')
	return handler as HlsErrorHandler
}

describe('PlayerPool', () => {
	it('applyWindow creates slots with role-appropriate hls config', async () => {
		const { PlayerPool } = await import('./player-pool')
		const pool = new PlayerPool()

		pool.applyWindow({
			active: { index: 0, src: 'a.m3u8' },
			warm: [{ index: 1, src: 'b.m3u8' }],
		})

		await flush()

		expect(hlsInstances).toHaveLength(2)
		expect(hlsInstances[0]?.config.maxBufferLength).toBe(20)
		expect(hlsInstances[1]?.config.maxBufferLength).toBe(5)
		// Without this cap ABR pulls 1080p into a ~530px column: measured at
		// 30MB of segments in the first two seconds.
		for (const hls of hlsInstances) {
			expect(hls.config.capLevelToPlayerSize).toBe(true)
		}

		pool.destroy()
	})

	it('shifting the window by one keeps existing buffers and reuses elements', async () => {
		const { PlayerPool } = await import('./player-pool')
		const pool = new PlayerPool()

		pool.applyWindow({
			active: { index: 0, src: '0.m3u8' },
			warm: [{ index: 1, src: '1.m3u8' }],
		})
		await flush()

		const destroyCallsBefore = hlsInstances.map(
			(h) => h.destroy.mock.calls.length,
		)

		pool.applyWindow({
			active: { index: 1, src: '1.m3u8' },
			warm: [
				{ index: 2, src: '2.m3u8' },
				{ index: 0, src: '0.m3u8' },
			],
		})
		await flush()

		for (const [i, hls] of hlsInstances.slice(0, 2).entries()) {
			expect(hls.destroy.mock.calls.length).toBe(destroyCallsBefore[i])
		}

		// A third slot should have been created for index 2.
		expect(hlsInstances.length).toBeGreaterThanOrEqual(3)

		pool.destroy()
	})

	it('shifting the window far away frees and reuses slots (never exceeds 3 elements)', async () => {
		const { PlayerPool } = await import('./player-pool')
		const pool = new PlayerPool()

		pool.applyWindow({
			active: { index: 0, src: '0.m3u8' },
			warm: [{ index: 1, src: '1.m3u8' }],
		})
		await flush()

		pool.applyWindow({
			active: { index: 5, src: '5.m3u8' },
			warm: [
				{ index: 6, src: '6.m3u8' },
				{ index: 4, src: '4.m3u8' },
			],
		})
		await flush()

		// Old slots for 0 and 1 should have been destroyed and reused.
		const destroyedCount = hlsInstances.filter(
			(h) => h.destroy.mock.calls.length > 0,
		).length
		expect(destroyedCount).toBeGreaterThan(0)

		// The pool caps at 3 slots (each backed by one real <video> element);
		// far window shifts must reuse elements via LRU rather than growing.
		expect(getSlots(pool).length).toBeLessThanOrEqual(3)

		pool.destroy()
	})

	it('claim appends element into container; release keeps it in place without destroying hls', async () => {
		const { PlayerPool } = await import('./player-pool')
		const pool = new PlayerPool()
		const container = document.createElement('div')

		const release = pool.claim({ index: 0, src: '0.m3u8' }, container, {
			onStatus: vi.fn(),
		})
		await flush()

		expect(container.children.length).toBe(1)

		release()

		// The element stays mounted (detaching repaints a blank frame — the
		// same panel usually re-claims it right away on a role flip); only a
		// claim from another container or freeSlot moves/detaches it.
		expect(container.children.length).toBe(1)
		expect(hlsInstances[0]?.destroy).not.toHaveBeenCalled()

		// A claim from a DIFFERENT container moves the element there.
		const otherContainer = document.createElement('div')
		pool.claim({ index: 0, src: '0.m3u8' }, otherContainer, {
			onStatus: vi.fn(),
		})
		expect(container.children.length).toBe(0)
		expect(otherContainer.children.length).toBe(1)

		pool.destroy()
	})

	it('setMuted cascades to every element', async () => {
		const { PlayerPool } = await import('./player-pool')
		const pool = new PlayerPool()

		pool.applyWindow({
			active: { index: 0, src: '0.m3u8' },
			warm: [{ index: 1, src: '1.m3u8' }],
		})
		await flush()

		pool.setMuted(false)
		const slots = getSlots(pool)
		for (const slot of slots) {
			expect(slot.element.muted).toBe(false)
		}

		pool.setMuted(true)
		for (const slot of slots) {
			expect(slot.element.muted).toBe(true)
		}

		pool.setVolume(0.25)
		for (const slot of slots) {
			expect(slot.element.volume).toBe(0.25)
		}

		pool.destroy()
	})

	it('retries play muted when unmuted playback rejects', async () => {
		const { usePlaybackStore } = await import('./playback.store')
		usePlaybackStore.getState().setMuted(false)

		const { PlayerPool } = await import('./player-pool')
		const pool = new PlayerPool()
		const container = document.createElement('div')

		let callCount = 0
		HTMLMediaElement.prototype.play = vi.fn(function (
			this: HTMLMediaElement,
		) {
			callCount += 1
			if (callCount === 1) {
				return Promise.reject(
					new DOMException('autoplay blocked', 'NotAllowedError'),
				)
			}
			return Promise.resolve()
		})

		pool.claim({ index: 0, src: '0.m3u8' }, container, {
			onStatus: vi.fn(),
		})
		await flush()
		await flush()

		expect(usePlaybackStore.getState().muted).toBe(true)
		expect(callCount).toBeGreaterThanOrEqual(2)

		pool.destroy()
		usePlaybackStore.getState().setMuted(true)
	})

	it('does not call play before the media source is attached', async () => {
		const { PlayerPool } = await import('./player-pool')
		const pool = new PlayerPool()
		const container = document.createElement('div')
		const play = HTMLMediaElement.prototype.play as ReturnType<typeof vi.fn>

		pool.claim({ index: 0, src: '0.m3u8' }, container, {
			onStatus: vi.fn(),
		})
		// Cold claim: hls.js chunk not resolved yet — play must not fire on a
		// source-less element (it would reject and read as "blocked").
		expect(play).not.toHaveBeenCalled()

		await flush()
		expect(play).toHaveBeenCalled()

		pool.destroy()
	})

	it('release pauses the element (removal from DOM does not stop playback)', async () => {
		const { PlayerPool } = await import('./player-pool')
		const pool = new PlayerPool()
		const container = document.createElement('div')
		const pause = HTMLMediaElement.prototype.pause as ReturnType<
			typeof vi.fn
		>

		const release = pool.claim({ index: 0, src: '0.m3u8' }, container, {
			onStatus: vi.fn(),
		})
		await flush()

		release()
		expect(pause).toHaveBeenCalled()

		pool.destroy()
	})

	it('non-autoplay rejections (AbortError) never rewrite the mute preference', async () => {
		const { usePlaybackStore } = await import('./playback.store')
		usePlaybackStore.getState().setMuted(false)

		HTMLMediaElement.prototype.play = vi
			.fn()
			.mockRejectedValue(new DOMException('interrupted', 'AbortError'))

		const { PlayerPool } = await import('./player-pool')
		const pool = new PlayerPool()
		const container = document.createElement('div')
		const onStatus = vi.fn()

		pool.claim({ index: 0, src: '0.m3u8' }, container, { onStatus })
		await flush()
		await flush()

		expect(usePlaybackStore.getState().muted).toBe(false)
		expect(onStatus).not.toHaveBeenCalledWith('blocked')

		pool.destroy()
		usePlaybackStore.getState().setMuted(true)
	})

	it('fatal hls error frees the slot, reports error, and a re-claim recreates it', async () => {
		const { PlayerPool } = await import('./player-pool')
		const pool = new PlayerPool()
		const container = document.createElement('div')
		const onStatus = vi.fn()

		pool.claim({ index: 0, src: '0.m3u8' }, container, { onStatus })
		await flush()

		const hls = hlsInstances[0]
		if (!hls) throw new Error('hls instance missing')
		const errorHandler = getErrorHandler(hls)
		errorHandler('hlsError', { fatal: true, type: 'otherError' })

		expect(hls.destroy).toHaveBeenCalled()
		expect(onStatus).toHaveBeenCalledWith('error')

		// Retry path: claiming the same index again must create a fresh
		// attach instead of returning the dead slot.
		pool.claim({ index: 0, src: '0.m3u8' }, container, {
			onStatus: vi.fn(),
		})
		await flush()
		expect(hlsInstances.length).toBeGreaterThanOrEqual(2)

		pool.destroy()
	})

	it('fatal network error retries via startLoad once before tearing down', async () => {
		const { PlayerPool } = await import('./player-pool')
		const pool = new PlayerPool()
		const container = document.createElement('div')
		const onStatus = vi.fn()

		pool.claim({ index: 0, src: '0.m3u8' }, container, { onStatus })
		await flush()

		const hls = hlsInstances[0]
		if (!hls) throw new Error('hls instance missing')
		const errorHandler = getErrorHandler(hls)

		errorHandler('hlsError', { fatal: true, type: 'networkError' })
		expect(hls.startLoad).toHaveBeenCalled()
		expect(hls.destroy).not.toHaveBeenCalled()

		errorHandler('hlsError', { fatal: true, type: 'networkError' })
		expect(hls.destroy).toHaveBeenCalled()
		expect(onStatus).toHaveBeenCalledWith('error')

		pool.destroy()
	})

	it('ensureActive never evicts a warm slot to make room, even on a full pool', async () => {
		const { PlayerPool } = await import('./player-pool')
		const pool = new PlayerPool()

		pool.applyWindow({
			active: { index: 5, src: '5.m3u8' },
			warm: [
				{ index: 4, src: '4.m3u8' },
				{ index: 6, src: '6.m3u8' },
			],
		})
		await flush()

		const warmHlsBefore = getSlots(pool)
			.filter((slot) => slot.index === 4 || slot.index === 6)
			.map((slot) => slot.hls)

		// A fast flick lands beyond the warmed window (index 10 is neither
		// warm nor active) while the pool is already full (1 active + 2 warm).
		pool.ensureActive({ index: 10, src: '10.m3u8' })
		await flush()

		for (const hls of warmHlsBefore) {
			expect(hls?.destroy).not.toHaveBeenCalled()
		}

		const indexesAfter = getSlots(pool).map((slot) => slot.index)
		expect(indexesAfter).toContain(4)
		expect(indexesAfter).toContain(6)
		expect(indexesAfter).toContain(10)
		// The old active slot (index 5) is the one repurposed for index 10.
		expect(indexesAfter).not.toContain(5)

		pool.destroy()
	})

	it('never calls stopLoad on warm slots (a pre-parse stopLoad freezes hls.js)', async () => {
		const { PlayerPool } = await import('./player-pool')
		const pool = new PlayerPool()
		const container = document.createElement('div')

		pool.claim({ index: 0, src: '0.m3u8' }, container, {
			onStatus: vi.fn(),
		})
		await flush()

		pool.applyWindow({
			active: { index: 0, src: '0.m3u8' },
			warm: [{ index: 1, src: '1.m3u8' }],
		})
		await flush()

		const activeSlot = getSlots(pool).find((slot) => slot.index === 0)
		if (!activeSlot) throw new Error('active slot missing')

		// Rebuffering of the active element must not pause warm loading —
		// the old bandwidth-priority path deadlocked on empty-slot activation.
		activeSlot.element.dispatchEvent(new Event('waiting'))
		activeSlot.element.dispatchEvent(new Event('playing'))

		for (const hls of hlsInstances) {
			expect(hls.stopLoad).not.toHaveBeenCalled()
		}

		pool.destroy()
	})

	it('setAutoLevelCap applies to existing and newly created hls instances', async () => {
		const { PlayerPool } = await import('./player-pool')
		const pool = new PlayerPool()

		pool.applyWindow({
			active: { index: 0, src: '0.m3u8' },
			warm: [{ index: 1, src: '1.m3u8' }],
		})
		await flush()

		pool.setAutoLevelCap(0)
		expect(hlsInstances[0]?.autoLevelCapping).toBe(0)
		expect(hlsInstances[1]?.autoLevelCapping).toBe(0)

		pool.applyWindow({
			active: { index: 5, src: '5.m3u8' },
			warm: [{ index: 6, src: '6.m3u8' }],
		})
		await flush()

		const newInstance = hlsInstances[hlsInstances.length - 1]
		expect(newInstance?.autoLevelCapping).toBe(0)

		pool.destroy()
	})

	it('neighbor claim (play: false) mounts paused and reports ready on loadeddata', async () => {
		const { PlayerPool } = await import('./player-pool')
		const pool = new PlayerPool()
		const container = document.createElement('div')
		const onStatus = vi.fn()
		const play = HTMLMediaElement.prototype.play as ReturnType<typeof vi.fn>

		pool.claim(
			{ index: 1, src: '1.m3u8' },
			container,
			{ onStatus },
			{ play: false },
		)
		await flush()

		expect(container.children.length).toBe(1)
		expect(play).not.toHaveBeenCalled()
		expect(onStatus).toHaveBeenCalledWith('loading')

		container.querySelector('video')?.dispatchEvent(new Event('loadeddata'))
		expect(onStatus).toHaveBeenLastCalledWith('ready')

		pool.destroy()
	})

	it('togglePlayPause pauses a playing element and resumes a paused one', async () => {
		const { PlayerPool } = await import('./player-pool')
		const pool = new PlayerPool()
		const container = document.createElement('div')
		const play = HTMLMediaElement.prototype.play as ReturnType<typeof vi.fn>
		const pause = HTMLMediaElement.prototype.pause as ReturnType<
			typeof vi.fn
		>

		pool.claim({ index: 0, src: '0.m3u8' }, container, {
			onStatus: vi.fn(),
		})
		await flush()

		const video = container.querySelector('video')
		if (!video) throw new Error('video missing')

		// jsdom reports paused=true by default → toggle resumes.
		const playCallsBefore = play.mock.calls.length
		pool.togglePlayPause()
		expect(play.mock.calls.length).toBe(playCallsBefore + 1)

		// Simulate a playing element → toggle pauses and records the intent.
		Object.defineProperty(video, 'paused', {
			configurable: true,
			value: false,
		})
		pool.togglePlayPause()
		expect(pause).toHaveBeenCalled()

		pool.destroy()
	})

	it('fatal media error recovers once via recoverMediaError before tearing down', async () => {
		const { PlayerPool } = await import('./player-pool')
		const pool = new PlayerPool()
		const container = document.createElement('div')
		const onStatus = vi.fn()

		pool.claim({ index: 0, src: '0.m3u8' }, container, { onStatus })
		await flush()

		const hls = hlsInstances[0]
		if (!hls) throw new Error('hls instance missing')
		const errorHandler = getErrorHandler(hls)

		errorHandler('hlsError', { fatal: true, type: 'mediaError' })
		expect(hls.recoverMediaError).toHaveBeenCalledTimes(1)
		expect(hls.destroy).not.toHaveBeenCalled()

		errorHandler('hlsError', { fatal: true, type: 'mediaError' })
		expect(hls.destroy).toHaveBeenCalled()
		expect(onStatus).toHaveBeenCalledWith('error')

		pool.destroy()
	})

	it('claim reports ready immediately when the element already holds a decoded frame', async () => {
		const { PlayerPool } = await import('./player-pool')
		const pool = new PlayerPool()
		const container = document.createElement('div')

		pool.applyWindow({
			active: { index: 0, src: '0.m3u8' },
			warm: [],
		})
		await flush()

		const slot = getSlots(pool).find((s) => s.index === 0)
		if (!slot) throw new Error('slot missing')
		// A warmed element with buffered data (HAVE_CURRENT_DATA or better).
		Object.defineProperty(slot.element, 'readyState', {
			configurable: true,
			value: 2,
		})

		const onStatus = vi.fn()
		pool.claim({ index: 0, src: '0.m3u8' }, container, { onStatus })

		// The placeholder must drop immediately — first report is 'ready',
		// never a transient 'loading'.
		expect(onStatus).toHaveBeenNthCalledWith(1, 'ready')

		pool.destroy()
	})

	it('startSec configures hls startPosition; without it startPosition stays -1', async () => {
		const { PlayerPool } = await import('./player-pool')
		const pool = new PlayerPool()

		pool.applyWindow({
			active: { index: 0, src: '0.m3u8', startSec: 42 },
			warm: [{ index: 1, src: '1.m3u8' }],
		})
		await flush()

		expect(hlsInstances[0]?.config.startPosition).toBe(42)
		expect(hlsInstances[1]?.config.startPosition).toBe(-1)

		pool.destroy()
	})

	it('tab return resumes a system-paused video but never a user-paused one', async () => {
		const { PlayerPool } = await import('./player-pool')
		const pool = new PlayerPool()
		const container = document.createElement('div')
		const play = HTMLMediaElement.prototype.play as ReturnType<typeof vi.fn>
		const pause = HTMLMediaElement.prototype.pause as ReturnType<
			typeof vi.fn
		>

		pool.claim({ index: 0, src: '0.m3u8' }, container, {
			onStatus: vi.fn(),
		})
		await flush()

		let hidden = false
		Object.defineProperty(document, 'hidden', {
			configurable: true,
			get: () => hidden,
		})

		try {
			// Tab goes hidden → the pool pauses the element (system pause).
			hidden = true
			const pauseCallsBefore = pause.mock.calls.length
			document.dispatchEvent(new Event('visibilitychange'))
			expect(pause.mock.calls.length).toBe(pauseCallsBefore + 1)

			// Tab returns → a system-paused video auto-resumes.
			hidden = false
			const playCallsBefore = play.mock.calls.length
			document.dispatchEvent(new Event('visibilitychange'))
			expect(play.mock.calls.length).toBe(playCallsBefore + 1)

			// User taps pause: togglePlayPause on a playing element records
			// the intent.
			const video = container.querySelector('video')
			if (!video) throw new Error('video missing')
			Object.defineProperty(video, 'paused', {
				configurable: true,
				value: false,
			})
			pool.togglePlayPause()

			// Tab hides and returns → the intentional pause must survive.
			hidden = true
			document.dispatchEvent(new Event('visibilitychange'))
			hidden = false
			const playCallsAfterUserPause = play.mock.calls.length
			document.dispatchEvent(new Event('visibilitychange'))
			expect(play.mock.calls.length).toBe(playCallsAfterUserPause)
		} finally {
			Reflect.deleteProperty(document, 'hidden')
		}

		pool.destroy()
	})

	it('ensureActive promotes an already-warmed target on a full pool without any attach', async () => {
		const { PlayerPool } = await import('./player-pool')
		const pool = new PlayerPool()

		pool.applyWindow({
			active: { index: 5, src: '5.m3u8' },
			warm: [
				{ index: 4, src: '4.m3u8' },
				{ index: 6, src: '6.m3u8' },
			],
		})
		await flush()

		const instancesBefore = hlsInstances.length
		const warmSlot = getSlots(pool).find((slot) => slot.index === 4)
		if (!warmSlot?.hls) throw new Error('warm slot missing hls')

		// The flick settles on an index that is already warmed.
		pool.ensureActive({ index: 4, src: '4.m3u8' })
		await flush()

		// Promotion reconfigures in place — no new hls, nothing destroyed.
		expect(hlsInstances.length).toBe(instancesBefore)
		for (const hls of hlsInstances) {
			expect(hls.destroy).not.toHaveBeenCalled()
		}

		// Promoted slot got the active buffer profile and resumed loading.
		expect(warmSlot.hls.config.maxBufferLength).toBe(20)
		expect(warmSlot.hls.startLoad).toHaveBeenCalled()

		// The previously-active slot is demoted to warm, not freed.
		const prevActive = getSlots(pool).find((slot) => slot.index === 5)
		expect(prevActive?.hls?.config.maxBufferLength).toBe(5)

		const indexes = getSlots(pool).map((slot) => slot.index)
		expect(indexes).toContain(4)
		expect(indexes).toContain(5)
		expect(indexes).toContain(6)

		pool.destroy()
	})

	it('togglePlayPause is a no-op after applyWindow evicts the claimed slot', async () => {
		const { PlayerPool } = await import('./player-pool')
		const pool = new PlayerPool()
		const container = document.createElement('div')
		const play = HTMLMediaElement.prototype.play as ReturnType<typeof vi.fn>

		pool.claim({ index: 0, src: '0.m3u8' }, container, {
			onStatus: vi.fn(),
		})
		await flush()

		// Shift the window far away while the claim is still held — the
		// claimed slot is evicted and freeSlot must clear the active claim.
		pool.applyWindow({
			active: { index: 5, src: '5.m3u8' },
			warm: [
				{ index: 6, src: '6.m3u8' },
				{ index: 4, src: '4.m3u8' },
			],
		})
		await flush()

		// jsdom elements report paused=true, so a surviving claim would call
		// play() here — a cleared claim makes the toggle do nothing.
		const playCallsBefore = play.mock.calls.length
		pool.togglePlayPause()
		expect(play.mock.calls.length).toBe(playCallsBefore)

		pool.destroy()
	})

	it('destroy destroys every hls instance and clears slots', async () => {
		const { PlayerPool } = await import('./player-pool')
		const pool = new PlayerPool()

		pool.applyWindow({
			active: { index: 0, src: '0.m3u8' },
			warm: [{ index: 1, src: '1.m3u8' }],
		})
		await flush()

		pool.destroy()

		for (const hls of hlsInstances) {
			expect(hls.destroy).toHaveBeenCalled()
		}
	})
})
