import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

if (!process.env.NEXT_RUNTIME) {
	try {
		process.loadEnvFile('.env.local')
	} catch {
		// .env.local is optional: Docker/CI provide env variables directly,
		// and t3-env below still fails fast if a required one is missing.
	}
}

const env = createEnv({
	/*
	 * Serverside Environment variables, not available on the client.
	 * Will throw if you access these variables on the client.
	 */
	server: {
		// Public site origin for robots.txt / sitemap.xml. Those routes are
		// force-dynamic, so this is read (and the default applied) at runtime.
		SITE_URL: z.url().default('http://localhost:3000'),
	},
	experimental__runtimeEnv: true,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
})

export default env
