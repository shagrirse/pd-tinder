import { normalizeHeader } from '../import/columns';

export type ResponseRole = 'mentor' | 'mentee';

/** Case, outer whitespace and runs of internal whitespace never distinguish two names. */
export function normalizeName(raw: string): string {
	return raw.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Admin IDs compare without leading zeros: a spreadsheet round trip strips
 * them from `01234856`, and the roster holds the original.
 */
export function normalizeAdminId(raw: string): string {
	return raw
		.replace(/\s+/g, '')
		.toLowerCase()
		.replace(/^0+(?=.)/, '');
}

export function parseRole(raw: string): ResponseRole | null {
	const value = raw.trim().toLowerCase();
	return value === 'mentor' || value === 'mentee' ? value : null;
}

/** The importers' header normalisation, plus tolerance for an autocorrected ellipsis. */
export function headerKey(raw: string): string {
	return normalizeHeader(raw).replace(/…/g, '...');
}

/** Names that collide once normalised, reported with their first spelling and a count. */
export function duplicateNames(names: string[]): { name: string; count: number }[] {
	const groups = new Map<string, { name: string; count: number }>();
	for (const name of names) {
		const key = normalizeName(name);
		const group = groups.get(key);
		if (group) group.count += 1;
		else groups.set(key, { name, count: 1 });
	}
	return [...groups.values()].filter((g) => g.count > 1);
}
