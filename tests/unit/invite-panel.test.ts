import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('invite panel', () => {
	it('uses the warning palette, not the success one', () => {
		const source = readFileSync(
			new URL('../../src/routes/admin/people/+page.svelte', import.meta.url),
			'utf8'
		);
		const rule = source.match(/\.invite-panel\s*{([^}]*)}/)?.[1] ?? '';
		expect(rule).toContain('background: var(--meh-soft);');
		expect(rule).toContain('border: 1px solid var(--meh);');
		expect(rule).not.toContain('--like');
	});
});
