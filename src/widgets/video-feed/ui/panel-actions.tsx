'use client'

import { Heart, MessageCircle, Share2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { toast } from 'sonner'
import type { MediaItem } from '@/entities/media-item/model/media-item.schema'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'

function formatCount(count: number) {
	if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
	if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`
	return String(count)
}

function ActionButton({
	label,
	count,
	onClick,
	children,
}: {
	label: string
	count?: string
	onClick: () => void
	children: ReactNode
}) {
	return (
		<div className='flex flex-col items-center gap-1'>
			<Button
				variant='ghost'
				size='icon-lg'
				className='size-12 rounded-full bg-black/35 text-white backdrop-blur-md hover:bg-black/50 hover:text-white'
				onClick={onClick}
				aria-label={label}
			>
				{children}
			</Button>
			{count ? (
				<span className='font-medium text-white text-xs drop-shadow'>
					{count}
				</span>
			) : null}
		</div>
	)
}

// Deterministic stand-in until the API serves real comment counts.
function fakeCommentCount(index: number) {
	return index * 3 + 7
}

export function PanelActions({ item }: { item: MediaItem }) {
	const [liked, setLiked] = useState(false)
	const likes = item.likes + (liked ? 1 : 0)

	async function share() {
		// Per-item link; becomes a real deep link once /[id] routing lands.
		const url = new URL(window.location.href)
		url.searchParams.set('item', String(item.index))
		try {
			await navigator.clipboard.writeText(url.toString())
			toast('Ссылка скопирована')
		} catch {
			toast('Не удалось скопировать ссылку')
		}
	}

	return (
		<div className='pointer-events-auto flex flex-col items-center gap-3'>
			<ActionButton
				label={liked ? 'Убрать лайк' : 'Лайк'}
				count={formatCount(likes)}
				onClick={() => setLiked((value) => !value)}
			>
				<Heart
					className={cn(
						'size-6',
						liked && 'fill-red-500 text-red-500',
					)}
				/>
			</ActionButton>
			<ActionButton
				label='Комментарии'
				count={formatCount(fakeCommentCount(item.index))}
				onClick={() => toast('Комментарии появятся позже')}
			>
				<MessageCircle className='size-6' />
			</ActionButton>
			<ActionButton label='Поделиться' onClick={share}>
				<Share2 className='size-6' />
			</ActionButton>
		</div>
	)
}
