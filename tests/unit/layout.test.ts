import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('root layout', () => {
	it('wraps page content in a main landmark', () => {
		const source = readFileSync(
			new URL('../../src/routes/+layout.svelte', import.meta.url),
			'utf8'
		);
		expect(source).toMatch(/<main>\s*{@render children\(\)}\s*<\/main>/);
	});
});
