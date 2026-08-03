import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useMetricsStore } from '@/features/media-playback/model/metrics.store'
import { DebugMetrics } from './debug-metrics'

beforeEach(() => {
	useMetricsStore.setState({
		ttffMs: null,
		rebufferCount: 0,
		rebufferMs: 0,
		droppedFrames: 0,
	})
	window.history.replaceState(null, '', '/')
})

afterEach(() => {
	cleanup()
	window.history.replaceState(null, '', '/')
})

describe('DebugMetrics', () => {
	it('renders nothing without ?debug=1', () => {
		const { container } = render(<DebugMetrics />)
		expect(container).toBeEmptyDOMElement()
	})

	it('shows the overlay with ?debug=1', () => {
		window.history.replaceState(null, '', '/?debug=1')
		render(<DebugMetrics />)
		expect(screen.getByText(/TTFF/)).toBeInTheDocument()
	})

	it('renders the — placeholder while TTFF is unmeasured', () => {
		window.history.replaceState(null, '', '/?debug=1')
		render(<DebugMetrics />)
		expect(screen.getByText('TTFF: —')).toBeInTheDocument()
	})

	it('renders reported metric values', () => {
		window.history.replaceState(null, '', '/?debug=1')
		useMetricsStore.setState({
			ttffMs: 123,
			rebufferCount: 2,
			rebufferMs: 340,
			droppedFrames: 7,
		})
		render(<DebugMetrics />)

		expect(screen.getByText('TTFF: 123 ms')).toBeInTheDocument()
		expect(screen.getByText('rebuffer: 2× (340 ms)')).toBeInTheDocument()
		expect(screen.getByText('dropped: 7')).toBeInTheDocument()
	})
})
