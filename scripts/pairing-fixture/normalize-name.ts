import { CANONICAL_INDUSTRIES } from '../../src/lib/server/import/normalize';

/**
 * Reduce a free-text person name to a join key.
 *
 * The 9th Circle's three files joined on names typed by hand, and the join failed
 * for 26 of 70 (spec §2.5). This handles the mechanical failures: casing, stray
 * whitespace, a parenthesised industry suffix, a quoted nickname, trailing
 * punctuation. A nickname that REPLACES the legal name cannot be resolved here
 * and is left for a human to adjudicate.
 */
export function normalizeName(raw: string): { key: string; industry: string | null } {
	let industry: string | null = null;

	const withoutParens = raw.replace(/\(([^)]*)\)/g, (_match, inner: string) => {
		const candidate = CANONICAL_INDUSTRIES.find(
			(known) => known.toLowerCase() === inner.trim().toLowerCase()
		);
		if (candidate) industry = candidate;
		return ' ';
	});

	const key = withoutParens
		.replace(/["'“”][^"'“”]*["'“”]/g, ' ')
		.replace(/[ \s]+/g, ' ')
		.replace(/[.,;:]+\s*$/g, '')
		.trim()
		.toLowerCase();

	return { key, industry };
}
