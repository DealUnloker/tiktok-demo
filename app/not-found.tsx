import Link from 'next/link'
import { Routes } from '@/shared/config/routes'
import { Button } from '@/shared/ui/button'

export default function NotFound() {
	return (
		<main className='flex min-h-dvh flex-col items-center justify-center gap-4'>
			<h1 className='text-2xl font-semibold'>404</h1>
			<p className='text-muted-foreground'>Page not found</p>
			<Button
				variant='outline'
				nativeButton={false}
				render={<Link href={Routes.main} />}
			>
				Go home
			</Button>
		</main>
	)
}
