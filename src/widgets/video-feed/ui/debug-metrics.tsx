'use client'

import { useEffect, useState } from 'react'
import { useMetricsStore } from '@/features/media-playback/model/metrics.store'

// Playback-quality overlay, enabled with `?debug=1`. Reads location.search in
// an effect (no useSearchParams — keeps the page free of Suspense demands).
export function DebugMetrics() {
	const [enabled, setEnabled] = useState(false)
	const ttffMs = useMetricsStore((state) => state.ttffMs)
	const rebufferCount = useMetricsStore((state) => state.rebufferCount)
	const rebufferMs = useMetricsStore((state) => state.rebufferMs)
	const droppedFrames = useMetricsStore((state) => state.droppedFrames)

	useEffect(() => {
		setEnabled(
			new URLSearchParams(window.location.search).get('debug') === '1',
		)
	}, [])

	if (!enabled) return null

	return (
		<div className='pointer-events-none fixed top-4 left-4 z-50 rounded-md bg-black/70 px-3 py-2 font-mono text-white text-xs leading-5'>
			<p>TTFF: {ttffMs === null ? '—' : `${ttffMs} ms`}</p>
			<p>
				rebuffer: {rebufferCount}×{' '}
				{rebufferMs > 0 ? `(${rebufferMs} ms)` : ''}
			</p>
			<p>dropped: {droppedFrames}</p>
		</div>
	)
}
