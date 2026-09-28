import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('row link tap targets', () => {
	it('pads .member-link on roster and pairing', () => {
		for (const file of [
			'src/routes/admin/roster/+page.svelte',
			'src/routes/admin/pairing/+page.svelte'
		]) {
			const rule = read(file).match(/\.member-link\s*{([^}]*)}/)?.[1] ?? '';
			expect(rule).toContain('padding: 0.4rem 0;');
			expect(rule).toContain('display: inline-block;');
		}
	});

	it('pads .name-btn on results', () => {
		const rule = read('src/routes/results/+page.svelte').match(/\.name-btn\s*{([^}]*)}/)?.[1] ?? '';
		expect(rule).toContain('padding: 0.4rem 0;');
		expect(rule).toContain('display: inline-block;');
	});
});
