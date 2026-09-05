export const CANONICAL_INDUSTRIES = [
	'Finance',
	'Tech',
	'Consulting',
	'Marketing',
	'Niche',
	'HR/Ops'
] as const;

export type Industry = (typeof CANONICAL_INDUSTRIES)[number];

const INDUSTRY_ALIASES: Record<string, Industry> = {
	finance: 'Finance',
	tech: 'Tech',
	technology: 'Tech',
	consulting: 'Consulting',
	marketing: 'Marketing',
	niche: 'Niche',
	'hr/ops': 'HR/Ops',
	'hr /ops': 'HR/Ops',
	'hr/ ops': 'HR/Ops',
	'hr / ops': 'HR/Ops',
	'hr ops': 'HR/Ops',
	'human resource / ops': 'HR/Ops',
	'human resource/ops': 'HR/Ops',
	'human resources / ops': 'HR/Ops'
};

function collapse(raw: string): string {
	return raw.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function normalizeIndustry(raw: string): Industry | null {
	const key = collapse(raw);
	if (key === '') return null;
	if (INDUSTRY_ALIASES[key]) return INDUSTRY_ALIASES[key];
	// Tolerate spacing around the slash, e.g. "HR  /Ops" -> "hr/ops".
	const tightened = key.replace(/\s*\/\s*/g, '/');
	return INDUSTRY_ALIASES[tightened] ?? null;
}

export function classifyLinkedin(raw: string): 'valid' | 'missing' {
	return raw.toLowerCase().includes('linkedin.com/in/') ? 'valid' : 'missing';
}

export function normalizePriorMentee(raw: string): boolean {
	return /^\s*yes/i.test(raw);
}

export function normalizeGender(raw: string): string | null {
	const trimmed = raw.trim();
	return trimmed === '' ? null : trimmed;
}
