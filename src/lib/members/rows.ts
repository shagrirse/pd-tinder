/**
 * One member of the active cycle as the members page shows it, with pairing
 * status folded in. Built on the server by `listMemberRows` and shared with
 * the browser, so this file must not import anything from `$lib/server`.
 */

export type PairMethod = 'mutual_first' | 'mutual_any' | 'one_sided' | 'manual';

export const METHOD_LABEL: Record<PairMethod, string> = {
	mutual_first: 'Mutual · first choice',
	mutual_any: 'Mutual · other rank',
	one_sided: 'One-sided',
	manual: 'Manual'
};

export type MemberChoice = { rank: number; memberId: number; name: string; reason: string };

export type MemberRow = {
	id: number;
	role: 'mentor' | 'mentee';
	fullName: string;
	email: string;
	industry: string | null;
	studentId: string | null;
	applicantId: number | null;
	telegram: string | null;
	linkedin: string | null;
	submitted: boolean;
	/** The member's live pair, if any. */
	pair: {
		memberId: number;
		name: string;
		method: PairMethod;
		overrideReason: string | null;
	} | null;
	/** Paired, but not with anyone they chose (or they chose nobody). */
	gotNoChoice: boolean;
	/** From the latest baseline once one exists, otherwise from live preferences. */
	choices: MemberChoice[];
	choicesFromBaseline: boolean;
	/** The member's pair in the latest baseline, if a baseline exists and paired them. */
	baselinePair: {
		memberId: number;
		name: string;
		method: Exclude<PairMethod, 'manual'>;
	} | null;
};

export type PairingFilter = 'all' | 'not_submitted' | 'paired' | 'unpaired' | 'no_choice';

export const PAIRING_FILTERS: { value: PairingFilter; label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'not_submitted', label: 'Not submitted' },
	{ value: 'paired', label: 'Paired' },
	{ value: 'unpaired', label: 'Unpaired' },
	{ value: 'no_choice', label: 'Got none of their choices' }
];

/** Case-insensitive substring match on name, email and student ID. */
export function matchesSearch(row: MemberRow, query: string): boolean {
	const needle = query.trim().toLowerCase();
	if (needle === '') return true;
	return [row.fullName, row.email, row.studentId ?? ''].some((field) =>
		field.toLowerCase().includes(needle)
	);
}

export function matchesPairingFilter(row: MemberRow, filter: PairingFilter): boolean {
	switch (filter) {
		case 'all':
			return true;
		case 'not_submitted':
			return !row.submitted;
		case 'paired':
			return row.pair !== null;
		case 'unpaired':
			return row.pair === null;
		case 'no_choice':
			return row.gotNoChoice;
	}
}

export function pairingFilterCounts(rows: MemberRow[]): Record<PairingFilter, number> {
	const counts = { all: 0, not_submitted: 0, paired: 0, unpaired: 0, no_choice: 0 };
	for (const { value } of PAIRING_FILTERS) {
		counts[value] = rows.filter((row) => matchesPairingFilter(row, value)).length;
	}
	return counts;
}

export function industriesOf(rows: MemberRow[]): string[] {
	const found = new Set<string>();
	for (const row of rows) if (row.industry) found.add(row.industry);
	return [...found].sort((a, b) => a.localeCompare(b));
}

/** "Mentor ↔ Mentee" for a member's current pair, mentor first. */
function pairLabel(member: MemberRow): string {
	const partner = member.pair!.name;
	return member.role === 'mentor'
		? `${member.fullName} ↔ ${partner}`
		: `${partner} ↔ ${member.fullName}`;
}

/**
 * What pairing `member` with `partner` would break, as one sentence, or null
 * if nobody loses a pair. Mirrors the server: an override deletes any pair
 * either member is in.
 */
export function displacementWarning(member: MemberRow, partner: MemberRow): string | null {
	const ending = [member, partner].filter(
		(m) => m.pair !== null && m.pair.memberId !== (m === member ? partner.id : member.id)
	);
	if (ending.length === 0) return null;

	const pairs = ending.map(pairLabel).join(' and ');
	const displaced = ending.map((m) => m.pair!.name);
	const verb = displaced.length === 1 ? 'returns' : 'return';
	return `This ends ${pairs}. ${displaced.join(' and ')} ${verb} to unpaired.`;
}
