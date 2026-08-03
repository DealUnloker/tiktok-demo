import type { RefObject } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PlayerStatus, PoolEntry } from '../model/player-pool'
import { playerPool } from '../model/player-pool'

// Layout effect on the client, plain effect during SSR rendering (React warns
// about useLayoutEffect in server output). The claim MUST run before paint:
// panels mount mid-gesture under the virtualization window, and a passive
// effect would paint an empty frame before the warmed video element lands.
const useIsomorphicLayoutEffect =
	typeof window === 'undefined' ? useEffect : useLayoutEffect

// Bridges a feed panel to the player pool. `play: true` — the active panel
// (claims + starts playback); `play: false` — a neighbor panel that mounts
// its warmed element paused so the first frame is visible mid-swipe.
export function usePanelPlayer(
	entry: PoolEntry | null,
	slotRef: RefObject<HTMLDivElement | null>,
	play: boolean,
) {
	const [status, setStatus] = useState<PlayerStatus>('loading')
	const [retryCount, setRetryCount] = useState(0)
	// Set by retry() so the next claim counts as a user gesture — this is
	// what lets prefers-reduced-motion users start playback with a tap.
	const userInitiatedRef = useRef(false)

	// retryCount isn't read in the body — it's a dependency purely to force
	// this effect (and thus a fresh claim) to re-run on retry().
	useIsomorphicLayoutEffect(() => {
		if (!entry) {
			setStatus('loading')
			return
		}

		const el = slotRef.current
		if (!el) return

		const release = playerPool.claim(
			entry,
			el,
			{ onStatus: setStatus },
			{ play, userInitiated: userInitiatedRef.current },
		)
		userInitiatedRef.current = false

		return () => {
			release()
		}
	}, [entry, play, slotRef, retryCount])

	function retry() {
		userInitiatedRef.current = true
		setRetryCount((count) => count + 1)
	}

	return { status, retry }
}
