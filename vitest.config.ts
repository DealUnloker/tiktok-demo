import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	plugins: [react()],
	resolve: {
		// Resolves the tsconfig `@/` path alias natively
		tsconfigPaths: true,
	},
	test: {
		environment: 'jsdom',
		setupFiles: ['./vitest.setup.ts'],
		include: ['src/**/*.test.{ts,tsx}'],
		coverage: {
			include: ['src/**'],
		},
	},
})
