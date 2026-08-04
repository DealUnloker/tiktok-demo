import fsd from '@feature-sliced/steiger-plugin'
import { defineConfig } from 'steiger'

export default defineConfig([
	...fsd.configs.recommended,
	{
		rules: {
			'fsd/public-api': 'off',
			'fsd/no-public-api-sidestep': 'off',
			'fsd/insignificant-slice': 'warn',
		},
	},
	{
		// `providers` is the conventional app-layer segment name;
		// steiger-plugin >=0.7 flags it as essence-based
		files: ['./src/app/**'],
		rules: {
			'fsd/segments-by-purpose': 'off',
		},
	},
])
