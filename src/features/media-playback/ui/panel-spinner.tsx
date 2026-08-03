'use client'

import { Loader2 } from 'lucide-react'

// The single shared loading indicator for every feed panel (active or
// incoming neighbor). Fades in with a delay so instant starts never flash it.
export function PanelSpinner() {
	return (
		<div
			role='status'
			aria-label='Видео загружается'
			className='pointer-events-none absolute inset-0 flex animate-in items-center justify-center fade-in opacity-0 duration-300 [animation-delay:150ms] [animation-fill-mode:forwards]'
		>
			<div className='flex size-14 items-center justify-center rounded-full bg-black/35 shadow-lg backdrop-blur-md'>
				<Loader2
					aria-hidden
					className='size-7 animate-spin text-white'
				/>
			</div>
		</div>
	)
}
