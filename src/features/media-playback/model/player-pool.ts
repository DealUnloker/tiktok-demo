import type Hls from 'hls.js'
import { useMetricsStore } from './metrics.store'
import { usePlaybackStore } from './playback.store'

// Shared across every slot: multiple panels can attach around the same
// time (active + warm neighbors), and without memoizing the promise each
// would trigger its own `import('hls.js')` chunk fetch concurrently.
let hlsModulePromise: Promise<typeof import('hls.js')> | null = null
function loadHls() {
	if (!hlsModulePromise) {
		hlsModulePromise = import('hls.js')
	}
	return hlsModulePromise
}

function isNotAllowedError(error: unknown) {
	return error instanceof DOMException && error.name === 'NotAllowedError'
}

export type PlayerStatus =
	| 'loading'
	| 'ready'
	| 'playing'
	| 'paused'
	| 'blocked'
	| 'error'

export type PoolEntry = {
	index: number
	src: string
	// Virtual-clip start inside the stream (feed items are cut from long
	// public streams by start position).
	startSec?: number
}

type SlotRole = 'active' | 'warm'

type Slot = {
	element: HTMLVideoElement
	hls: Hls | null
	index: number | null
	role: SlotRole
	nativeSrc: boolean
	// Bumped on every (re)attach and free, so stale async work (hls import
	// resolution, deferred play attempts) can detect it was superseded and
	// bail out instead of touching a slot reused for another index.
	generation: number
	// Resolves once the slot's media source is wired (hls attached or native
	// src set). Play attempts must wait on it — a play() on a source-less
	// element rejects with NotSupportedError, not an autoplay block.
	attachPromise: Promise<void> | null
}

const MAX_SLOTS = 3

// maxBufferSize matters as much as maxBufferLength: hls.js keeps buffering
// up to that many BYTES even after the length cap is reached (default 60MB —
// hundreds of seconds on low-bitrate streams).
const ROLE_CONFIG: Record<
	SlotRole,
	{ maxBufferLength: number; maxBufferSize: number }
> = {
	active: { maxBufferLength: 20, maxBufferSize: 12 * 1024 * 1024 },
	warm: { maxBufferLength: 5, maxBufferSize: 4 * 1024 * 1024 },
}

type ActiveClaim = {
	slot: Slot
	onStatus: (status: PlayerStatus) => void
	// Set when the user explicitly paused via togglePlayPause — a tab-return
	// resume must not override an intentional pause.
	userPaused: boolean
}

export class PlayerPool {
	private slots: Slot[] = []
	private initialized = false
	private activeIndex: number | null = null
	private activeClaim: ActiveClaim | null = null
	private unsubscribeStore: (() => void) | null = null
	private onVisibilityChange: (() => void) | null = null
	private autoLevelCap = -1

	private ensureInit() {
		if (this.initialized) return
		if (typeof document === 'undefined') return
		this.initialized = true

		this.unsubscribeStore = usePlaybackStore.subscribe((state) => {
			this.setMuted(state.muted)
			this.setVolume(state.volume)
		})

		this.onVisibilityChange = () => {
			const claim = this.activeClaim
			if (!claim) return
			if (document.hidden) {
				claim.slot.element.pause()
			} else if (!claim.userPaused) {
				claim.slot.element.play().catch((error: unknown) => {
					if (isNotAllowedError(error)) {
						claim.onStatus('blocked')
					}
				})
			}
		}
		document.addEventListener('visibilitychange', this.onVisibilityChange)
	}

	private createSlot(): Slot {
		const element = document.createElement('video')
		element.muted = usePlaybackStore.getState().muted
		element.volume = usePlaybackStore.getState().volume
		element.playsInline = true
		element.loop = true
		// object-contain: the whole frame must stay visible (letterboxed on
		// mismatched aspect ratios), not zoom-cropped to fill.
		element.className = 'absolute inset-0 h-full w-full object-contain'
		return {
			element,
			hls: null,
			index: null,
			role: 'warm',
			nativeSrc: false,
			generation: 0,
			attachPromise: null,
		}
	}

	private freeSlot(slot: Slot) {
		slot.generation += 1
		if (slot.hls) {
			slot.hls.destroy()
			slot.hls = null
		}
		slot.element.pause()
		slot.element.remove()
		slot.element.removeAttribute('src')
		slot.element.load()
		slot.index = null
		slot.nativeSrc = false
		slot.role = 'warm'
		slot.attachPromise = null
	}

	private attach(slot: Slot, src: string, role: SlotRole, startSec = 0) {
		slot.generation += 1
		const generation = slot.generation
		slot.role = role

		slot.attachPromise = loadHls().then(({ default: HlsCtor }) => {
			if (generation !== slot.generation) return

			if (HlsCtor.isSupported()) {
				// The slot's role may have changed while the import was in
				// flight (warm neighbor promoted to active) — read it now,
				// not from the captured argument.
				const hls = new HlsCtor({
					...ROLE_CONFIG[slot.role],
					// Virtual clip: buffer straight from the clip's start.
					startPosition: startSec > 0 ? startSec : -1,
				})
				slot.hls = hls
				slot.nativeSrc = false
				hls.autoLevelCapping = this.autoLevelCap

				let recoveredNetwork = false
				let recoveredMedia = false
				hls.on(HlsCtor.Events.ERROR, (_event, data) => {
					if (!data.fatal) return
					if (
						data.type === HlsCtor.ErrorTypes.NETWORK_ERROR &&
						!recoveredNetwork
					) {
						recoveredNetwork = true
						hls.startLoad()
						return
					}
					if (
						data.type === HlsCtor.ErrorTypes.MEDIA_ERROR &&
						!recoveredMedia
					) {
						recoveredMedia = true
						try {
							hls.recoverMediaError()
							return
						} catch {
							// unrecoverable — fall through to teardown
						}
					}
					const wasClaimed = this.activeClaim?.slot === slot
					this.freeSlot(slot)
					if (wasClaimed) {
						this.activeClaim?.onStatus('error')
					}
				})
				hls.loadSource(src)
				hls.attachMedia(slot.element)
			} else if (
				slot.element.canPlayType('application/vnd.apple.mpegurl')
			) {
				slot.element.src = src
				slot.nativeSrc = true
				if (startSec > 0) {
					slot.element.addEventListener(
						'loadedmetadata',
						() => {
							if (generation === slot.generation) {
								slot.element.currentTime = startSec
							}
						},
						{ once: true },
					)
				}
			}
		})
	}

	// NOTE: an earlier iteration paused warm-slot loading (`stopLoad`) while
	// the active element was rebuffering, to prioritize bandwidth. Removed
	// after real-browser testing: `stopLoad()` before MANIFEST_PARSED freezes
	// hls.js's playlist loader in a state a later `startLoad()` does not
	// revive, and the pause flag deadlocked on activation of a still-empty
	// slot (its `waiting` paused all warm loads, incl. its own data path).
	// Warm slots are already capped at a 5s buffer — the bandwidth win was
	// not worth the fragility.
	private reconfigureRole(slot: Slot, role: SlotRole) {
		slot.role = role
		if (slot.hls) {
			slot.hls.config.maxBufferLength = ROLE_CONFIG[role].maxBufferLength
			slot.hls.config.maxBufferSize = ROLE_CONFIG[role].maxBufferSize
			if (role === 'active') {
				slot.hls.startLoad()
			}
		}
	}

	private findSlotByIndex(index: number): Slot | undefined {
		return this.slots.find((slot) => slot.index === index)
	}

	private pickSlotToFree(
		exceptIndexes: Set<number>,
		restrictToIndexes?: Set<number>,
	): Slot | null {
		if (this.slots.length < MAX_SLOTS) return null

		const active = this.activeIndex ?? 0
		let candidate: Slot | null = null
		let candidateDistance = -1
		for (const slot of this.slots) {
			if (slot.index === null) return slot
			if (exceptIndexes.has(slot.index)) continue
			if (restrictToIndexes && !restrictToIndexes.has(slot.index))
				continue
			const distance = Math.abs(slot.index - active)
			if (distance > candidateDistance) {
				candidateDistance = distance
				candidate = slot
			}
		}
		return candidate
	}

	private ensureSlotForIndex(
		index: number,
		src: string,
		role: SlotRole,
		exceptIndexes: Set<number>,
		restrictFreeToIndexes?: Set<number>,
		startSec = 0,
	): Slot {
		const existing = this.findSlotByIndex(index)
		if (existing) {
			if (existing.role !== role) {
				this.reconfigureRole(existing, role)
			}
			return existing
		}

		if (this.slots.length < MAX_SLOTS) {
			const slot = this.createSlot()
			this.slots.push(slot)
			slot.index = index
			this.attach(slot, src, role, startSec)
			return slot
		}

		// When restricted (ensureActive's fast-flick path), only reuse a slot
		// within the allowed set — never evict a protected warm buffer. Fall
		// back to the unrestricted pick only if no allowed candidate exists
		// (shouldn't normally happen: the previously-active slot should
		// always be eligible).
		const toFree = restrictFreeToIndexes
			? (this.pickSlotToFree(exceptIndexes, restrictFreeToIndexes) ??
				this.pickSlotToFree(exceptIndexes))
			: this.pickSlotToFree(exceptIndexes)
		if (toFree) {
			this.freeSlot(toFree)
			toFree.index = index
			this.attach(toFree, src, role, startSec)
			return toFree
		}

		// All slots are protected (shouldn't normally happen with a 3-slot
		// window of 1 active + 2 warm) — fall back to reusing the slot
		// farthest from active regardless of protection.
		const fallback = this.slots.reduce((farthest, slot) => {
			const active = this.activeIndex ?? 0
			const slotDist = Math.abs((slot.index ?? active) - active)
			const farthestDist = Math.abs((farthest.index ?? active) - active)
			return slotDist > farthestDist ? slot : farthest
		}, this.slots[0])
		this.freeSlot(fallback)
		fallback.index = index
		this.attach(fallback, src, role, startSec)
		return fallback
	}

	applyWindow(entries: { active: PoolEntry; warm: PoolEntry[] }): void {
		this.ensureInit()
		this.activeIndex = entries.active.index

		const wanted = [entries.active, ...entries.warm]
		const wantedIndexes = new Set(wanted.map((entry) => entry.index))

		for (const slot of this.slots) {
			if (slot.index !== null && !wantedIndexes.has(slot.index)) {
				this.freeSlot(slot)
			}
		}

		this.ensureSlotForIndex(
			entries.active.index,
			entries.active.src,
			'active',
			wantedIndexes,
			undefined,
			entries.active.startSec ?? 0,
		)

		for (const entry of entries.warm) {
			this.ensureSlotForIndex(
				entry.index,
				entry.src,
				'warm',
				wantedIndexes,
				undefined,
				entry.startSec ?? 0,
			)
		}

		for (const slot of this.slots) {
			if (slot.index === entries.active.index && slot.role !== 'active') {
				this.reconfigureRole(slot, 'active')
			} else if (
				slot.index !== null &&
				slot.index !== entries.active.index &&
				slot.role !== 'warm'
			) {
				this.reconfigureRole(slot, 'warm')
			}
		}
	}

	// Ensures/promotes only the active slot, demoting other slots' roles —
	// unlike applyWindow, never frees a slot, so warm buffers survive a fast
	// flick through several panels before the gesture settles.
	ensureActive(entry: PoolEntry): void {
		this.ensureInit()
		const previousActiveIndex = this.activeIndex
		this.activeIndex = entry.index

		// If the pool is already full and the target isn't warmed yet, the
		// only slot allowed to be reused is the previously-active one — its
		// content is what the user just flicked away from, so repurposing it
		// doesn't cost anything, whereas evicting a warm neighbor would.
		this.ensureSlotForIndex(
			entry.index,
			entry.src,
			'active',
			new Set([entry.index]),
			previousActiveIndex !== null
				? new Set([previousActiveIndex])
				: undefined,
			entry.startSec ?? 0,
		)

		for (const slot of this.slots) {
			if (slot.index === entry.index && slot.role !== 'active') {
				this.reconfigureRole(slot, 'active')
			} else if (
				slot.index !== null &&
				slot.index !== entry.index &&
				slot.role !== 'warm'
			) {
				this.reconfigureRole(slot, 'warm')
			}
		}
	}

	setAutoLevelCap(cap: number): void {
		this.autoLevelCap = cap
		for (const slot of this.slots) {
			if (slot.hls) {
				slot.hls.autoLevelCapping = cap
			}
		}
	}

	// Mounts the slot's element into a panel container. `play: true` = the
	// active panel (starts playback, owns bandwidth priority); `play: false`
	// = a neighbor panel pre-mounting its warmed element paused, so the first
	// frame is already visible while the swipe gesture is still in flight.
	claim(
		index: number,
		src: string,
		container: HTMLElement,
		callbacks: { onStatus: (status: PlayerStatus) => void },
		options: {
			play?: boolean
			userInitiated?: boolean
			startSec?: number
		} = {},
	): () => void {
		this.ensureInit()
		const shouldPlay = options.play !== false

		const slot = this.ensureSlotForIndex(
			index,
			src,
			shouldPlay ? 'active' : 'warm',
			new Set([index]),
			undefined,
			options.startSec ?? 0,
		)
		if (shouldPlay) {
			this.activeIndex = index
		}

		// Re-appending an element that is already in this container reparents
		// it, which repaints a blank video frame — a visible flash on every
		// neighbor→active role switch. Move it only when it actually lives
		// elsewhere.
		if (slot.element.parentElement !== container) {
			container.appendChild(slot.element)
		}
		// A warmed slot already holds a decoded frame — report it so the
		// poster can drop immediately instead of waiting for events.
		callbacks.onStatus(slot.element.readyState >= 2 ? 'ready' : 'loading')

		// Debug-overlay metrics for the ACTIVE claim: TTFF (claim → first
		// 'playing'), rebuffer time ('waiting' → 'playing'), dropped frames.
		const claimedAt = performance.now()
		let firstPlayingSeen = false
		let rebufferStartedAt: number | null = null

		const onWaiting = () => {
			if (shouldPlay && firstPlayingSeen && rebufferStartedAt === null) {
				rebufferStartedAt = performance.now()
			}
			callbacks.onStatus('loading')
		}
		const onLoadedData = () => callbacks.onStatus('ready')
		const onPlaying = () => {
			if (shouldPlay) {
				const metrics = useMetricsStore.getState()
				if (!firstPlayingSeen) {
					firstPlayingSeen = true
					metrics.reportTtff(performance.now() - claimedAt)
				} else if (rebufferStartedAt !== null) {
					metrics.reportRebuffer(
						performance.now() - rebufferStartedAt,
					)
				}
				rebufferStartedAt = null
				metrics.reportDroppedFrames(
					slot.element.getVideoPlaybackQuality?.()
						?.droppedVideoFrames ?? 0,
				)
			}
			callbacks.onStatus('playing')
		}
		const onPause = () => callbacks.onStatus('paused')
		const onError = () => callbacks.onStatus('error')
		slot.element.addEventListener('waiting', onWaiting)
		slot.element.addEventListener('stalled', onWaiting)
		slot.element.addEventListener('loadeddata', onLoadedData)
		slot.element.addEventListener('playing', onPlaying)
		if (shouldPlay) {
			// Only the active claim reports 'paused' — a neighbor's element is
			// paused by design, its panel must keep showing the plain frame.
			slot.element.addEventListener('pause', onPause)
		}
		slot.element.addEventListener('error', onError)

		if (shouldPlay) {
			this.activeClaim = {
				slot,
				onStatus: callbacks.onStatus,
				userPaused: false,
			}
		}

		let released = false
		const claimGeneration = slot.generation

		slot.element.muted = usePlaybackStore.getState().muted
		slot.element.volume = usePlaybackStore.getState().volume

		// prefers-reduced-motion: no AUTOplay — the user starts playback with
		// an explicit tap (options.userInitiated, set by the retry path).
		const autoplayAllowed =
			options.userInitiated ||
			typeof window === 'undefined' ||
			typeof window.matchMedia !== 'function' ||
			!window.matchMedia('(prefers-reduced-motion: reduce)').matches

		if (shouldPlay && !autoplayAllowed) {
			callbacks.onStatus('blocked')
		}

		if (shouldPlay && autoplayAllowed) {
			const attemptPlay = () => {
				slot.element.play().catch((error: unknown) => {
					if (released || slot.generation !== claimGeneration) return
					if (!isNotAllowedError(error)) {
						// AbortError (load interrupted by eviction) or
						// NotSupportedError (source torn down) — not an autoplay
						// block, so never rewrite the user's sound preference.
						return
					}
					if (!slot.element.muted) {
						slot.element.muted = true
						usePlaybackStore.getState().setMuted(true)
						slot.element.play().catch(() => {
							if (!released) callbacks.onStatus('blocked')
						})
					} else {
						callbacks.onStatus('blocked')
					}
				})
			}

			// Play only after the media source is wired — a cold claim fires
			// before the hls.js chunk has even downloaded.
			;(slot.attachPromise ?? Promise.resolve()).then(() => {
				if (released || slot.generation !== claimGeneration) return
				attemptPlay()
			})
		}

		return () => {
			if (released) return
			released = true
			slot.element.removeEventListener('waiting', onWaiting)
			slot.element.removeEventListener('stalled', onWaiting)
			slot.element.removeEventListener('loadeddata', onLoadedData)
			slot.element.removeEventListener('playing', onPlaying)
			slot.element.removeEventListener('pause', onPause)
			slot.element.removeEventListener('error', onError)
			const wasActiveClaim = this.activeClaim?.slot === slot
			if (wasActiveClaim) {
				this.activeClaim = null
			}
			// Pause, but do NOT detach the element here: the same panel often
			// re-claims it in the same commit (neighbor→active flip), and a
			// remove/append cycle repaints a blank frame. The element leaves
			// the DOM with its panel (React unmounts the container), moves via
			// appendChild on a claim from another container, or is detached by
			// freeSlot on eviction. Pausing still matters — a DOM-attached
			// element in an unmounted-soon panel must not keep playing audio.
			slot.element.pause()
			this.reconfigureRole(slot, 'warm')
		}
	}

	// Tap-to-pause on the active panel. Resuming counts as a user gesture, so
	// autoplay-policy rejections here only surface as 'blocked'.
	togglePlayPause(): void {
		const claim = this.activeClaim
		if (!claim) return
		const element = claim.slot.element
		if (element.paused) {
			claim.userPaused = false
			element.play().catch((error: unknown) => {
				if (isNotAllowedError(error)) {
					claim.onStatus('blocked')
				}
			})
		} else {
			claim.userPaused = true
			element.pause()
		}
	}

	setMuted(muted: boolean): void {
		for (const slot of this.slots) {
			slot.element.muted = muted
		}
	}

	setVolume(volume: number): void {
		for (const slot of this.slots) {
			slot.element.volume = volume
		}
	}

	destroy(): void {
		for (const slot of this.slots) {
			this.freeSlot(slot)
		}
		this.slots = []
		this.activeIndex = null
		this.activeClaim = null
		this.unsubscribeStore?.()
		this.unsubscribeStore = null
		if (this.onVisibilityChange && typeof document !== 'undefined') {
			document.removeEventListener(
				'visibilitychange',
				this.onVisibilityChange,
			)
		}
		this.onVisibilityChange = null
		this.initialized = false
	}
}

export const playerPool = new PlayerPool()
