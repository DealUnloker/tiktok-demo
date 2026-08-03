import { useDrag } from '@use-gesture/react'
import type { RefObject } from 'react'
import { useRef } from 'react'

// Mouse drag-to-scroll for the feed (touch and wheel are native browser
// scrolling): @use-gesture owns pointer tracking, capture, and tap-vs-drag
// filtering; the domain part here is scrollTop following the drag with snap
// suspended, a 15% threshold picking the panel on release, and a smooth
// settle before snap comes back.
export function useFeedDrag(scrollerRef: RefObject<HTMLDivElement | null>) {
	// Pending snap-restore from the PREVIOUS drag's settle: it must be torn
	// down when a new drag starts, or its `scrollend` could re-enable
	// mandatory snap in the middle of the new drag.
	const pendingRestoreRef = useRef<{
		cancel: () => void
	} | null>(null)

	useDrag(
		(state) => {
			const el = scrollerRef.current
			if (!el) return
			const pointerType =
				'pointerType' in state.event ? state.event.pointerType : null
			if (pointerType && pointerType !== 'mouse') return

			if (state.first) {
				// Real controls win (volume zone, action buttons, links);
				// the full-panel tap-to-pause layer is the drag surface.
				const target =
					state.event.target instanceof Element
						? state.event.target
						: null
				const button = target?.closest('button')
				if (
					target?.closest('[data-volume-zone], a') ||
					(button && !button.hasAttribute('data-tap-layer'))
				) {
					state.cancel()
					return
				}
				pendingRestoreRef.current?.cancel()
				pendingRestoreRef.current = null
				// Mandatory snap fights direct scrollTop writes.
				el.classList.remove('snap-y')
				return el.scrollTop
			}

			const startScroll =
				typeof state.memo === 'number' ? state.memo : el.scrollTop
			const dy = state.movement[1]

			if (state.active) {
				el.scrollTop = startScroll - dy
			}

			if (state.last) {
				const restoreSnap = () => {
					pendingRestoreRef.current = null
					el.classList.add('snap-y')
				}
				if (state.tap) {
					restoreSnap()
				} else {
					const panelHeight = el.clientHeight
					const from = Math.round(startScroll / panelHeight)
					const target =
						Math.abs(dy) > panelHeight * 0.15
							? from - Math.sign(dy)
							: from
					el.addEventListener('scrollend', restoreSnap, {
						once: true,
					})
					// Fallback if scrollend never fires (already there).
					const timer = setTimeout(restoreSnap, 600)
					pendingRestoreRef.current = {
						cancel: () => {
							el.removeEventListener('scrollend', restoreSnap)
							clearTimeout(timer)
						},
					}
					el.scrollTo({
						top: target * panelHeight,
						behavior: 'smooth',
					})
				}
			}
			return startScroll
		},
		{ target: scrollerRef, axis: 'y', filterTaps: true },
	)
}
