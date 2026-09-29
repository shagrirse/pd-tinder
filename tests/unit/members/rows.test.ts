import { describe, expect, it } from 'vitest';
import {
	displacementWarning,
	industriesOf,
	matchesPairingFilter,
	matchesSearch,
	pairingFilterCounts,
	type MemberRow
} from '../../../src/lib/members/rows';

function row(overrides: Partial<MemberRow> & Pick<MemberRow, 'id' | 'fullName'>): MemberRow {
	return {
		role: 'mentor',
		email: `${overrides.fullName.toLowerCase().replace(/\s+/g, '.')}@example.com`,
		industry: 'Finance',
		studentId: null,
		applicantId: null,
		telegram: null,
		linkedin: null,
		submitted: false,
		pair: null,
		gotNoChoice: false,
		choices: [],
		choicesFromBaseline: false,
		baselinePair: null,
		...overrides
	};
}

const priya = row({ id: 1, fullName: 'Priya Mentor', studentId: '02000001' });
const jordan = row({ id: 2, fullName: 'Jordan Mentee', role: 'mentee', industry: 'Tech' });

describe('matchesSearch', () => {
	it('matches name case-insensitively on trimmed input', () => {
		expect(matchesSearch(priya, '  pRiYa ')).toBe(true);
	});

	it('matches email and student ID', () => {
		expect(matchesSearch(priya, 'priya.mentor@')).toBe(true);
		expect(matchesSearch(priya, '0200')).toBe(true);
	});

	it('treats an empty query as matching everyone', () => {
		expect(matchesSearch(jordan, '')).toBe(true);
		expect(matchesSearch(jordan, '   ')).toBe(true);
	});

	it('does not throw on a member with no student ID', () => {
		expect(matchesSearch(jordan, '0200')).toBe(false);
	});
});

describe('matchesPairingFilter', () => {
	const paired = row({
		id: 3,
		fullName: 'Sam Mentor',
		submitted: true,
		pair: { memberId: 2, name: 'Jordan Mentee', method: 'mutual_first', overrideReason: null }
	});
	const noChoice = row({
		id: 4,
		fullName: 'Alex Mentor',
		pair: { memberId: 5, name: 'Bo Mentee', method: 'manual', overrideReason: 'x' },
		gotNoChoice: true
	});

	it('applies each filter', () => {
		expect(matchesPairingFilter(priya, 'all')).toBe(true);
		expect(matchesPairingFilter(priya, 'not_submitted')).toBe(true);
		expect(matchesPairingFilter(paired, 'not_submitted')).toBe(false);
		expect(matchesPairingFilter(paired, 'paired')).toBe(true);
		expect(matchesPairingFilter(priya, 'paired')).toBe(false);
		expect(matchesPairingFilter(priya, 'unpaired')).toBe(true);
		expect(matchesPairingFilter(paired, 'unpaired')).toBe(false);
		expect(matchesPairingFilter(noChoice, 'no_choice')).toBe(true);
		expect(matchesPairingFilter(paired, 'no_choice')).toBe(false);
	});

	it('counts every filter over the full list', () => {
		expect(pairingFilterCounts([priya, paired, noChoice])).toEqual({
			all: 3,
			not_submitted: 2,
			paired: 2,
			unpaired: 1,
			no_choice: 1
		});
	});
});

describe('industriesOf', () => {
	it('lists each industry once, sorted, skipping members with none', () => {
		const none = row({ id: 9, fullName: 'No Industry', industry: null });
		expect(industriesOf([jordan, priya, none, priya])).toEqual(['Finance', 'Tech']);
	});
});

describe('displacementWarning', () => {
	const pairOf = (memberId: number, name: string) => ({
		memberId,
		name,
		method: 'mutual_first' as const,
		overrideReason: null
	});

	it('is null when neither member is paired', () => {
		expect(displacementWarning(priya, jordan)).toBeNull();
	});

	it('is null when the two are already paired together', () => {
		const p = { ...priya, pair: pairOf(2, 'Jordan Mentee') };
		const j = { ...jordan, pair: pairOf(1, 'Priya Mentor') };
		expect(displacementWarning(p, j)).toBeNull();
	});

	it("names the partner's pair that ends, mentor first", () => {
		const sam = row({ id: 3, fullName: 'Sam Mentor' });
		const j = { ...jordan, pair: pairOf(1, 'Priya Mentor') };
		expect(displacementWarning(sam, j)).toBe(
			'This ends Priya Mentor ↔ Jordan Mentee. Priya Mentor returns to unpaired.'
		);
	});

	it("names the member's own pair that ends", () => {
		const j = { ...jordan, pair: pairOf(1, 'Priya Mentor') };
		const sam = row({ id: 3, fullName: 'Sam Mentor' });
		expect(displacementWarning(j, sam)).toBe(
			'This ends Priya Mentor ↔ Jordan Mentee. Priya Mentor returns to unpaired.'
		);
	});

	it('names both pairs when both members are paired elsewhere', () => {
		const ada = row({ id: 1, fullName: 'Ada Mentor', pair: pairOf(6, 'Bo Mentee') });
		const cy = row({
			id: 7,
			fullName: 'Cy Mentee',
			role: 'mentee',
			pair: pairOf(8, 'Di Mentor')
		});
		expect(displacementWarning(ada, cy)).toBe(
			'This ends Ada Mentor ↔ Bo Mentee and Di Mentor ↔ Cy Mentee. Bo Mentee and Di Mentor return to unpaired.'
		);
	});
});
