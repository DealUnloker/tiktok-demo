import { beforeEach, describe, expect, it } from 'vitest'
import { useMetricsStore } from './metrics.store'

beforeEach(() => {
	useMetricsStore.setState({
		ttffMs: null,
		rebufferCount: 0,
		rebufferMs: 0,
		droppedFrames: 0,
	})
})

describe('metrics store', () => {
	it('reportTtff rounds to whole milliseconds and overwrites', () => {
		useMetricsStore.getState().reportTtff(123.6)
		expect(useMetricsStore.getState().ttffMs).toBe(124)

		useMetricsStore.getState().reportTtff(80.2)
		expect(useMetricsStore.getState().ttffMs).toBe(80)
	})

	it('reportRebuffer accumulates both count and duration', () => {
		useMetricsStore.getState().reportRebuffer(100.4)
		useMetricsStore.getState().reportRebuffer(250.8)

		const state = useMetricsStore.getState()
		expect(state.rebufferCount).toBe(2)
		// round(0 + 100.4) = 100, then round(100 + 250.8) = 351
		expect(state.rebufferMs).toBe(351)
	})

	it('reportDroppedFrames overwrites with the latest total', () => {
		useMetricsStore.getState().reportDroppedFrames(5)
		useMetricsStore.getState().reportDroppedFrames(12)

		expect(useMetricsStore.getState().droppedFrames).toBe(12)
	})
})
