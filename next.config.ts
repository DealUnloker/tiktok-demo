import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
	reactStrictMode: true,
	reactCompiler: true,
	poweredByHeader: false,
	typedRoutes: true,
	output: process.env.DOCKER_BUILD ? 'standalone' : undefined,
	async redirects() {
		return [
			// The feed used to live at /feed before becoming the home page.
			{ source: '/feed', destination: '/', permanent: true },
		]
	},
}

export default nextConfig
