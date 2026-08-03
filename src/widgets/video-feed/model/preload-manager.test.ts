import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PreloadTarget } from './preload-manager'
import { PreloadManager } from './preload-manager'

function createItems(count: number) {
	return Array.from({ length: count }, (_, index) => ({
		index,
		hlsUrl: `https://example.com/${index}.m3u8`,
	}))
}

function createMockPool() {
	return {
		ensureActive: vi.fn<PreloadTarget['ensureActive']>(),
		applyWindow: vi.fn<PreloadTarget['applyWindow']>(),
		setAutoLevelCap: vi.fn<PreloadTarget['setAutoLevelCap']>(),
	}
}

describe('PreloadManager', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		global.fetch = vi.fn().mockResolvedValue(new Response())
	})

	afterEach(() => {
		vi.useRealTimers()
		vi.restoreAllMocks()
	})

	it('calls ensureActive immediately and debounces applyWindow until settle', () => {
		const pool = createMockPool()
		const manager = new PreloadManager(pool)
		const items = createItems(10)

		manager.update({ activeIndex: 5, items, settled: true })

		expect(pool.ensureActive).toHaveBeenCalledWith({
			index: 5,
			src: items[5]?.hlsUrl,
		})
		expect(pool.applyWindow).not.toHaveBeenCalled()

		vi.advanceTimersByTime(100)

		expect(pool.applyWindow).toHaveBeenCalledTimes(1)
		expect(pool.applyWindow).toHaveBeenCalledWith({
			active: { index: 5, src: items[5]?.hlsUrl },
			warm: [
				{ index: 6, src: items[6]?.hlsUrl },
				{ index: 4, src: items[4]?.hlsUrl },
			],
		})
	})

	it('debounces rapid updates and reflects only the last activeIndex', () => {
		const pool = createMockPool()
		const manager = new PreloadManager(pool)
		const items = createItems(10)

		manager.update({ activeIndex: 3, items, settled: true })
		vi.advanceTimersByTime(30)
		manager.update({ activeIndex: 4, items, settled: true })
		vi.advanceTimersByTime(30)
		manager.update({ activeIndex: 5, items, settled: true })

		vi.advanceTimersByTime(100)

		expect(pool.applyWindow).toHaveBeenCalledTimes(1)
		expect(pool.applyWindow).toHaveBeenCalledWith({
			active: { index: 5, src: items[5]?.hlsUrl },
			warm: [
				{ index: 6, src: items[6]?.hlsUrl },
				{ index: 4, src: items[4]?.hlsUrl },
			],
		})
	})

	it('never schedules applyWindow while unsettled', () => {
		const pool = createMockPool()
		const manager = new PreloadManager(pool)
		const items = createItems(10)

		manager.update({ activeIndex: 5, items, settled: false })
		expect(pool.ensureActive).toHaveBeenCalledTimes(1)

		manager.update({ activeIndex: 6, items, settled: false })
		expect(pool.ensureActive).toHaveBeenCalledTimes(2)

		vi.advanceTimersByTime(1000)

		expect(pool.applyWindow).not.toHaveBeenCalled()
	})

	it('caps quality and skips warm/prefetch under data-saver', () => {
		Object.defineProperty(globalThis.navigator, 'connection', {
			value: { saveData: true },
			configurable: true,
		})

		try {
			const pool = createMockPool()
			const manager = new PreloadManager(pool)
			const items = createItems(10)

			manager.update({ activeIndex: 5, items, settled: true })
			vi.advanceTimersByTime(100)

			expect(pool.applyWindow).toHaveBeenCalledWith({
				active: { index: 5, src: items[5]?.hlsUrl },
				warm: [],
			})
			expect(pool.setAutoLevelCap).toHaveBeenCalledWith(0)
			expect(global.fetch).not.toHaveBeenCalled()
		} finally {
			delete (globalThis.navigator as { connection?: unknown }).connection
		}
	})

	it('prefetches manifests two-ahead/behind, dedupes, and aborts on destroy', () => {
		const pool = createMockPool()
		const manager = new PreloadManager(pool)
		const items = createItems(10)

		manager.update({ activeIndex: 5, items, settled: true })
		vi.advanceTimersByTime(100)

		expect(global.fetch).toHaveBeenCalledWith(
			items[7]?.hlsUrl,
			expect.objectContaining({ mode: 'cors' }),
		)
		expect(global.fetch).toHaveBeenCalledWith(
			items[3]?.hlsUrl,
			expect.objectContaining({ mode: 'cors' }),
		)
		expect(global.fetch).toHaveBeenCalledTimes(2)

		const firstCallSignal = (global.fetch as ReturnType<typeof vi.fn>).mock
			.calls[0]?.[1]?.signal as AbortSignal

		manager.update({ activeIndex: 5, items, settled: true })
		vi.advanceTimersByTime(100)

		// No duplicate fetch for the same already-prefetched URLs.
		expect(global.fetch).toHaveBeenCalledTimes(2)

		expect(firstCallSignal.aborted).toBe(false)
		manager.destroy()
		expect(firstCallSignal.aborted).toBe(true)
	})

	it('retries a prefetch that previously failed instead of marking it done forever', async () => {
		global.fetch = vi.fn().mockRejectedValue(new Error('network error'))

		const pool = createMockPool()
		const manager = new PreloadManager(pool)
		const items = createItems(10)

		manager.update({ activeIndex: 5, items, settled: true })
		vi.advanceTimersByTime(100)
		// Let the rejected fetch's `.catch` handler run so the URL is
		// removed from the dedupe set before the next assertion.
		await Promise.resolve()
		await Promise.resolve()

		expect(global.fetch).toHaveBeenCalledTimes(2)

		manager.update({ activeIndex: 5, items, settled: true })
		vi.advanceTimersByTime(100)
		await Promise.resolve()

		// The previously-failed URLs are retried, not skipped forever.
		expect(global.fetch).toHaveBeenCalledTimes(4)
	})

	it('is a no-op when activeIndex is beyond the items list', () => {
		const pool = createMockPool()
		const manager = new PreloadManager(pool)
		const items = createItems(3)

		manager.update({ activeIndex: 3, items, settled: true })
		vi.advanceTimersByTime(1000)

		expect(pool.ensureActive).not.toHaveBeenCalled()
		expect(pool.applyWindow).not.toHaveBeenCalled()
		expect(pool.setAutoLevelCap).not.toHaveBeenCalled()
		expect(global.fetch).not.toHaveBeenCalled()
	})

	it('destroy() is idempotent and leaves no pending work behind', () => {
		const pool = createMockPool()
		const manager = new PreloadManager(pool)
		const items = createItems(10)

		manager.update({ activeIndex: 5, items, settled: true })
		vi.advanceTimersByTime(100)

		const signal = (global.fetch as ReturnType<typeof vi.fn>).mock
			.calls[0]?.[1]?.signal as AbortSignal

		manager.destroy()
		expect(signal.aborted).toBe(true)

		expect(() => manager.destroy()).not.toThrow()
		expect(signal.aborted).toBe(true)

		// No stray timer fires more work after destroy.
		vi.advanceTimersByTime(1000)
		expect(pool.applyWindow).toHaveBeenCalledTimes(1)
	})

	it('re-fetches only the URL whose prefetch failed on the next settle', async () => {
		global.fetch = vi
			.fn()
			.mockRejectedValueOnce(new Error('network error'))
			.mockResolvedValue(new Response())

		const pool = createMockPool()
		const manager = new PreloadManager(pool)
		const items = createItems(10)

		manager.update({ activeIndex: 5, items, settled: true })
		vi.advanceTimersByTime(100)
		// Let the rejected fetch's `.catch` handler run so the URL leaves
		// the dedupe set.
		await Promise.resolve()
		await Promise.resolve()

		const fetchMock = global.fetch as ReturnType<typeof vi.fn>
		expect(fetchMock).toHaveBeenCalledTimes(2)
		const failedUrl = fetchMock.mock.calls[0]?.[0]
		const succeededUrl = fetchMock.mock.calls[1]?.[0]

		manager.update({ activeIndex: 5, items, settled: true })
		vi.advanceTimersByTime(100)
		await Promise.resolve()

		// Only the failed URL is fetched again; the succeeded one stays
		// deduped.
		expect(fetchMock).toHaveBeenCalledTimes(3)
		expect(fetchMock.mock.calls[2]?.[0]).toBe(failedUrl)
		const callsForSucceeded = fetchMock.mock.calls.filter(
			(call) => call[0] === succeededUrl,
		)
		expect(callsForSucceeded).toHaveLength(1)
	})

	it("treats a slow effectiveType ('2g') as data-saver even without saveData", () => {
		Object.defineProperty(globalThis.navigator, 'connection', {
			value: { effectiveType: '2g' },
			configurable: true,
		})

		try {
			const pool = createMockPool()
			const manager = new PreloadManager(pool)
			const items = createItems(10)

			manager.update({ activeIndex: 5, items, settled: true })
			vi.advanceTimersByTime(100)

			expect(pool.applyWindow).toHaveBeenCalledWith({
				active: { index: 5, src: items[5]?.hlsUrl },
				warm: [],
			})
			expect(pool.setAutoLevelCap).toHaveBeenCalledWith(0)
			expect(global.fetch).not.toHaveBeenCalled()
		} finally {
			delete (globalThis.navigator as { connection?: unknown }).connection
		}
	})

	it('resets the quality cap to -1 once the network budget returns to normal', () => {
		const pool = createMockPool()
		const manager = new PreloadManager(pool)
		const items = createItems(10)

		Object.defineProperty(globalThis.navigator, 'connection', {
			value: { effectiveType: '2g' },
			configurable: true,
		})
		try {
			manager.update({ activeIndex: 5, items, settled: true })
			vi.advanceTimersByTime(100)
			expect(pool.setAutoLevelCap).toHaveBeenLastCalledWith(0)
		} finally {
			delete (globalThis.navigator as { connection?: unknown }).connection
		}

		manager.update({ activeIndex: 5, items, settled: true })
		vi.advanceTimersByTime(100)

		expect(pool.setAutoLevelCap).toHaveBeenLastCalledWith(-1)
		expect(pool.applyWindow).toHaveBeenLastCalledWith({
			active: { index: 5, src: items[5]?.hlsUrl },
			warm: [
				{ index: 6, src: items[6]?.hlsUrl },
				{ index: 4, src: items[4]?.hlsUrl },
			],
		})
	})

	it('handles edge indexes without crashing (start and end of list)', () => {
		const pool = createMockPool()
		const manager = new PreloadManager(pool)
		const items = createItems(3)

		manager.update({ activeIndex: 0, items, settled: true })
		vi.advanceTimersByTime(100)

		expect(pool.applyWindow).toHaveBeenCalledWith({
			active: { index: 0, src: items[0]?.hlsUrl },
			warm: [{ index: 1, src: items[1]?.hlsUrl }],
		})

		const pool2 = createMockPool()
		const manager2 = new PreloadManager(pool2)

		manager2.update({ activeIndex: 2, items, settled: true })
		vi.advanceTimersByTime(100)

		expect(pool2.applyWindow).toHaveBeenCalledWith({
			active: { index: 2, src: items[2]?.hlsUrl },
			warm: [{ index: 1, src: items[1]?.hlsUrl }],
		})
	})
})
