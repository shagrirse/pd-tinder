import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
	{
		ignores: [
			'build/',
			'.svelte-kit/',
			'drizzle/',
			'node_modules/',
			'test-results/',
			'.worktrees/',
			'.claude/'
		]
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		}
	},
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parserOptions: {
				parser: tseslint.parser
			}
		}
	},
	{
		// Pre-existing across the app; adopting these fully means real behavioural
		// changes (resolve()-wrapped links, per-row keys, SvelteMap). Warn for now
		// rather than block CI on work outside this change's scope.
		rules: {
			'svelte/no-navigation-without-resolve': 'warn',
			'svelte/require-each-key': 'warn',
			'svelte/prefer-svelte-reactivity': 'warn'
		}
	}
);
