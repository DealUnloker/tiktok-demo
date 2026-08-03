import { useDrag } from '@use-gesture/react'
import type { RefObject } from 'react'

// Mouse drag-to-scroll for the feed (touch and wheel are native browser
// scrolling): @use-gesture owns pointer tracking, capture, and tap-vs-drag
// filtering; the domain part here is scrollTop following the drag with snap
// suspended, a 15% threshold picking the panel on release, and a smooth
// settle before snap comes back.
export function useFeedDrag(scrollerRef: RefObject<HTMLDivElement | null>) {
	useDrag(
		(state) => {
			const el = scrollerRef.current
			if (!el) return
			const event = state.event as PointerEvent
			if (event.pointerType && event.pointerType !== 'mouse') return

			if (state.first) {
				// Real controls win (volume zone, action buttons, links);
				// the full-panel tap-to-pause layer is the drag surface.
				const target =
					event.target instanceof Element ? event.target : null
				const button = target?.closest('button')
				if (
					target?.closest('[data-volume-zone], a') ||
					(button && !button.hasAttribute('data-tap-layer'))
				) {
					state.cancel()
					return
				}
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
				const restoreSnap = () => el.classList.add('snap-y')
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
					setTimeout(restoreSnap, 600)
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
