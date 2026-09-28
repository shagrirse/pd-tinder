import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../src/app.css', import.meta.url), 'utf8');

describe('contrast-safe text color tokens', () => {
	it('defines the three new tokens', () => {
		expect(css).toContain('--danger-text: #ff6659;');
		expect(css).toContain('--skip-text: #d97a48;');
		expect(css).toContain('--danger-on-paper: #c8281c;');
	});

	it('keeps the original --danger and --skip tokens unchanged', () => {
		expect(css).toContain('--danger: #e2382c;');
		expect(css).toContain('--skip: #b1552f;');
	});

	it('repaints verdict-skip and verdict-flag text with the new tokens', () => {
		const skip = css.match(/\.verdict-skip\s*{([^}]*)}/)?.[1] ?? '';
		const flag = css.match(/\.verdict-flag\s*{([^}]*)}/)?.[1] ?? '';
		expect(skip).toContain('background: var(--skip-soft);');
		expect(skip).toContain('color: var(--skip-text);');
		expect(flag).toContain('background: var(--danger-soft);');
		expect(flag).toContain('color: var(--danger-text);');
	});
});
