'use client'

import { Play, Volume2, VolumeX } from 'lucide-react'
import { usePlaybackStore } from '@/features/media-playback/model/playback.store'
import type { PlayerStatus } from '@/features/media-playback/model/player-pool'
import { Button } from '@/shared/ui/button'

type PlayerOverlayProps = {
	status: PlayerStatus
	onRetry: () => void
}

export function PlayerOverlay({ status, onRetry }: PlayerOverlayProps) {
	const muted = usePlaybackStore((state) => state.muted)
	const toggleMute = usePlaybackStore((state) => state.toggleMute)

	return (
		<div className='pointer-events-none absolute inset-0'>
			<Button
				variant='ghost'
				size='icon'
				className='pointer-events-auto absolute top-4 right-4 rounded-full bg-black/30 text-white backdrop-blur hover:bg-black/40 hover:text-white'
				onClick={toggleMute}
				aria-label={muted ? 'Включить звук' : 'Выключить звук'}
			>
				{muted ? <VolumeX /> : <Volume2 />}
			</Button>

			{status === 'blocked' ? (
				<button
					type='button'
					onClick={onRetry}
					className='pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/20'
					aria-label='Воспроизвести'
				>
					<Play
						className='size-16 text-white/90'
						fill='currentColor'
					/>
				</button>
			) : null}

			{status === 'error' ? (
				<div className='pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40 px-6 text-center'>
					<p className='text-white'>Не удалось воспроизвести</p>
					<Button variant='secondary' onClick={onRetry}>
						Повторить
					</Button>
				</div>
			) : null}
		</div>
	)
}
