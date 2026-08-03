import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaItem } from '@/entities/media-item/model/media-item.schema'
import { PanelActions } from './panel-actions'

vi.mock('sonner', () => ({ toast: vi.fn() }))

const toastMock = vi.mocked(toast)

function makeItem(overrides: Partial<MediaItem> = {}): MediaItem {
	return {
		id: 'item-3',
		index: 3,
		title: 'Test clip',
		description: 'A test clip',
		hlsUrl: 'https://example.com/stream.m3u8',
		startSec: 0,
		posterUrl: null,
		durationSec: 30,
		author: { name: 'Author', avatarUrl: null },
		likes: 10,
		...overrides,
	}
}

beforeEach(() => {
	toastMock.mockClear()
})

afterEach(() => {
	cleanup()
})

describe('PanelActions', () => {
	it('like toggles the count and the aria-label', () => {
		render(<PanelActions item={makeItem({ likes: 10 })} />)

		expect(screen.getByText('10')).toBeInTheDocument()

		fireEvent.click(screen.getByRole('button', { name: 'Лайк' }))
		expect(screen.getByText('11')).toBeInTheDocument()
		expect(screen.queryByText('10')).not.toBeInTheDocument()

		fireEvent.click(screen.getByRole('button', { name: 'Убрать лайк' }))
		expect(screen.getByText('10')).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Лайк' })).toBeInTheDocument()
	})

	it('share fires the not-implemented toast', () => {
		render(<PanelActions item={makeItem()} />)
		fireEvent.click(screen.getByRole('button', { name: 'Поделиться' }))

		expect(toastMock).toHaveBeenCalledWith('Шеринг появится позже')
	})

	it.each([
		[999, '999'],
		[1500, '1.5K'],
		[2_000_000, '2.0M'],
	])('formats %i likes as %s', (likes, expected) => {
		render(<PanelActions item={makeItem({ likes })} />)
		expect(screen.getByText(expected)).toBeInTheDocument()
	})
})
