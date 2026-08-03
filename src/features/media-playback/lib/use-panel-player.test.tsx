import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PoolEntry } from '../model/player-pool'
import { playerPool } from '../model/player-pool'
import { usePanelPlayer } from './use-panel-player'

const { releaseSpy } = vi.hoisted(() => ({ releaseSpy: vi.fn() }))

vi.mock('../model/player-pool', () => ({
	playerPool: { claim: vi.fn(() => releaseSpy) },
}))

const claimMock = vi.mocked(playerPool.claim)

const entry: PoolEntry = { index: 0, src: '0.m3u8' }

function makeSlotRef() {
	return { current: document.createElement('div') }
}

beforeEach(() => {
	claimMock.mockClear()
	releaseSpy.mockClear()
})

afterEach(() => {
	cleanup()
})

describe('usePanelPlayer', () => {
	it('claims the entry into the slot element on mount', () => {
		const slotRef = makeSlotRef()
		renderHook(() => usePanelPlayer(entry, slotRef, true))

		expect(claimMock).toHaveBeenCalledTimes(1)
		const [claimedEntry, el, callbacks, options] =
			claimMock.mock.calls[0] ?? []
		expect(claimedEntry).toBe(entry)
		expect(el).toBe(slotRef.current)
		expect(callbacks?.onStatus).toBeTypeOf('function')
		expect(options).toEqual({ play: true, userInitiated: false })
	})

	it('releases the claim on unmount', () => {
		const { unmount } = renderHook(() =>
			usePanelPlayer(entry, makeSlotRef(), true),
		)
		expect(releaseSpy).not.toHaveBeenCalled()

		unmount()
		expect(releaseSpy).toHaveBeenCalledTimes(1)
	})

	it('reports loading and does not claim when entry is null', () => {
		const { result } = renderHook(() =>
			usePanelPlayer(null, makeSlotRef(), true),
		)

		expect(result.current.status).toBe('loading')
		expect(claimMock).not.toHaveBeenCalled()
	})

	it('propagates status updates from the pool claim', () => {
		const { result } = renderHook(() =>
			usePanelPlayer(entry, makeSlotRef(), true),
		)
		const onStatus = claimMock.mock.calls[0]?.[2]?.onStatus
		if (!onStatus) throw new Error('onStatus callback missing')

		act(() => onStatus('playing'))
		expect(result.current.status).toBe('playing')
	})

	it('retry() releases the old claim and re-claims as user-initiated', () => {
		const slotRef = makeSlotRef()
		const { result } = renderHook(() =>
			usePanelPlayer(entry, slotRef, true),
		)
		expect(claimMock).toHaveBeenCalledTimes(1)

		act(() => result.current.retry())

		expect(releaseSpy).toHaveBeenCalledTimes(1)
		expect(claimMock).toHaveBeenCalledTimes(2)
		expect(claimMock.mock.calls[1]?.[3]).toEqual({
			play: true,
			userInitiated: true,
		})
	})

	it('re-claims with the new play flag when the play prop changes', () => {
		const slotRef = makeSlotRef()
		const { rerender } = renderHook(
			({ play }: { play: boolean }) =>
				usePanelPlayer(entry, slotRef, play),
			{ initialProps: { play: false } },
		)
		expect(claimMock).toHaveBeenCalledTimes(1)
		expect(claimMock.mock.calls[0]?.[3]).toEqual({
			play: false,
			userInitiated: false,
		})

		rerender({ play: true })

		expect(releaseSpy).toHaveBeenCalledTimes(1)
		expect(claimMock).toHaveBeenCalledTimes(2)
		expect(claimMock.mock.calls[1]?.[3]).toEqual({
			play: true,
			userInitiated: false,
		})
	})
})
