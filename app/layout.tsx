import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { AppProviders } from '@/app/providers/app-providers'
import { Toaster } from '@/shared/ui/sonner'
import './globals.css'

export const metadata: Metadata = {
	title: {
		default: 'Лента',
		template: '%s | Лента',
	},
	description:
		'Вертикальная лента коротких видео: автовоспроизведение, предзагрузка соседних роликов, виртуализация на любую длину',
}

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang='ru'>
			<body className='bg-background text-foreground antialiased'>
				<AppProviders>{children}</AppProviders>
				<Toaster />
			</body>
		</html>
	)
}
