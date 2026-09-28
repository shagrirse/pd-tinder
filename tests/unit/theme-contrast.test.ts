import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../src/app.css', import.meta.url), 'utf8');

describe('contrast-safe text color tokens', () => {
	it('defines the three new tokens', () => {
		expect(css).toContain('--danger-text: #ff6659;');
		expect(css).toContain('--skip-text: #d97a48;');
		expect(css).toContain('--danger-on-paper: #bc261b;');
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

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('dark-surface form-error and danger-text usage', () => {
	const files = [
		'src/routes/admin/people/+page.svelte',
		'src/routes/admin/roster/+page.svelte',
		'src/routes/admin/pairing/+page.svelte',
		'src/routes/admin/import/+page.svelte',
		'src/lib/components/MemberDetailModal.svelte'
	];

	it.each(files)('%s repaints .form-error text without touching its border', (file) => {
		const source = read(file);
		const rule = source.match(/\.form-error\s*{([^}]*)}/)?.[1] ?? '';
		expect(rule).toContain('color: var(--danger-text);');
		expect(rule).toContain('border: 1px solid var(--danger);');
	});
});

describe('applicant detail modal', () => {
	const source = read('src/lib/components/ApplicantDetailModal.svelte');

	it('repaints the load-error text', () => {
		const rule = source.match(/\.state\.error\s*{([^}]*)}/)?.[1] ?? '';
		expect(rule).toContain('color: var(--danger-text);');
	});
});

describe('paper-surface danger text', () => {
	const files = [
		'src/lib/components/AuthCard.svelte',
		'src/routes/member/[token]/+page.svelte',
		'src/routes/review/+page.svelte'
	];

	it.each(files)('%s uses --danger-on-paper', (file) => {
		expect(read(file)).toContain('var(--danger-on-paper)');
	});
});

describe('admin/people danger text and deactivated tag', () => {
	const source = read('src/routes/admin/people/+page.svelte');

	it('repaints .unassigned and .deactivated-tag', () => {
		expect(source.match(/\.unassigned\s*{([^}]*)}/)?.[1]).toContain('color: var(--danger-text);');
		const tag = source.match(/\.deactivated-tag\s*{([^}]*)}/)?.[1] ?? '';
		expect(tag).toContain('color: var(--danger-text);');
		expect(tag).toContain('border: 1px solid var(--danger);');
	});

	it('repaints .link-btn.danger where it now lives: PersonRowActions', () => {
		const component = read('src/lib/components/PersonRowActions.svelte');
		expect(component.match(/\.link-btn\.danger\s*{([^}]*)}/)?.[1]).toContain(
			'color: var(--danger-text);'
		);
	});

	it('moves the deactivated tag outside the dimmed person-name span', () => {
		const nameOpen = source.indexOf('<span class="person-name">');
		const nameClose = source.indexOf('</span>', nameOpen);
		const tagIndex = source.indexOf('class="deactivated-tag"');
		expect(nameOpen).toBeGreaterThan(-1);
		expect(tagIndex).toBeGreaterThan(nameClose);
	});
});
