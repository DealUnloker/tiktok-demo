'use client'

import { Play } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import type { PlayerStatus } from '../model/player-pool'
import { VolumeControl } from './volume-control'

type PlayerOverlayProps = {
	status: PlayerStatus
	onRetry: () => void
}

export function PlayerOverlay({ status, onRetry }: PlayerOverlayProps) {
	return (
		<div className='pointer-events-none absolute inset-0'>
			<div className='absolute top-4 right-4'>
				<VolumeControl />
			</div>

			{status === 'paused' ? (
				// Indicator only — the panel's tap layer underneath resumes.
				<div className='absolute inset-0 flex items-center justify-center'>
					<Play
						className='size-16 text-white/85 drop-shadow-lg'
						fill='currentColor'
					/>
				</div>
			) : null}

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
