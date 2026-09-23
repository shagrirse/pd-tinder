import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../src/app.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../../src/app.html', import.meta.url), 'utf8');

const token = (name: string): string => {
	const match = css.match(new RegExp(`${name}:\\s*([^;]+);`));
	if (!match) throw new Error(`Token ${name} not found in app.css`);
	return match[1].trim();
};

describe('TMC theme tokens', () => {
	it('uses the sampled TMC palette', () => {
		expect(token('--bg')).toBe('#0e1a26');
		expect(token('--bg-raised')).toBe('#14242f');
		expect(token('--bg-raised-2')).toBe('#1b2d3a');
		expect(token('--text')).toBe('#f1f2f3');
		expect(token('--text-dim')).toBe('#9db0c0');
		expect(token('--text-faint')).toBe('#6e8090');
		expect(token('--flame')).toBe('#d8ae5e');
		expect(token('--flame-soft')).toBe('rgba(216, 174, 94, 0.16)');
		expect(token('--paper')).toBe('#f4f6f8');
		expect(token('--ink-on-paper')).toBe('#0e1a26');
	});

	it('retired the charred palette', () => {
		expect(css).not.toContain('#ff5a36');
		expect(css).not.toContain('#150f0f');
		expect(css).not.toContain('#f4ece0');
		expect(css).not.toContain('#f6efe0');
		expect(html).not.toContain('content="#150f0f"');
	});

	it('loads the brand typefaces', () => {
		expect(token('--font-display')).toContain("'Cormorant Garamond'");
		expect(token('--font-body')).toContain("'Jost'");
		expect(html).toContain('family=Cormorant+Garamond');
		expect(html).toContain('family=Jost');
		expect(html).toContain('family=IBM+Plex+Mono');
		expect(html).toContain('1,700');
	});
});
