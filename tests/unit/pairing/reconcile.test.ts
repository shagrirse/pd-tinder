import { describe, expect, it } from 'vitest';
import {
	reconcile,
	type MemberRef,
	type PreferenceRef,
	type ProposedPair
} from '../../../src/lib/server/pairing/passes';

const roster: MemberRef[] = [
	{ id: 1, role: 'mentor' },
	{ id: 3, role: 'mentor' },
	{ id: 5, role: 'mentor' },
	{ id: 2, role: 'mentee' },
	{ id: 4, role: 'mentee' },
	{ id: 6, role: 'mentee' }
];

function pref(memberId: number, rank: number, choiceMemberId: number): PreferenceRef {
	return { memberId, rank, choiceMemberId };
}

describe('reconcile', () => {
	it('runs the three passes in order and labels each pair with its method', () => {
		const result = reconcile(roster, [
			// 1 <-> 2: mutual first
			pref(1, 1, 2),
			pref(2, 1, 1),
			// 3 <-> 4: mutual, but at ranks 2 and 3
			pref(3, 2, 4),
			pref(4, 3, 3),
			// 5 -> 6 only
			pref(5, 1, 6)
		]);

		expect(result.pairs.map((p) => [p.mentorId, p.menteeId, p.method])).toEqual([
			[1, 2, 'mutual_first'],
			[3, 4, 'mutual_any'],
			[5, 6, 'one_sided']
		]);
		expect(result.unpaired).toEqual([]);
	});

	it('reports members left over as the residual, sorted by id', () => {
		const result = reconcile(roster, [pref(1, 1, 2), pref(2, 1, 1)]);
		expect(result.unpaired).toEqual([3, 4, 5, 6]);
	});

	it('reports a member paired with someone they never chose', () => {
		const result = reconcile(roster, [pref(1, 1, 2)]);
		expect(result.pairs).toHaveLength(1);
		// The mentor got their first choice; the mentee named nobody.
		expect(result.gotNoChoice).toEqual([2]);
	});

	it('reports both sides when neither named the other', () => {
		const manual: ProposedPair[] = [
			{ mentorId: 1, menteeId: 2, method: 'manual', mentorRank: null, menteeRank: null }
		];
		const result = reconcile(roster, [], manual);
		expect(result.gotNoChoice).toEqual([1, 2]);
	});

	it('keeps manual pairs and never re-pairs their members', () => {
		const manual: ProposedPair[] = [
			{ mentorId: 1, menteeId: 4, method: 'manual', mentorRank: null, menteeRank: null }
		];
		// 1 and 2 are a mutual first choice, but 1 is manually held with 4.
		const result = reconcile(roster, [pref(1, 1, 2), pref(2, 1, 1)], manual);
		expect(result.pairs).toEqual(manual);
		expect(result.unpaired).toEqual([2, 3, 5, 6]);
	});

	it('is deterministic across repeated runs on shuffled input', () => {
		const input = [pref(1, 1, 2), pref(2, 1, 1), pref(3, 2, 4), pref(4, 3, 3), pref(5, 1, 6)];
		const first = reconcile(roster, input);
		const second = reconcile(roster, [...input].reverse());
		expect(second).toEqual(first);
	});
});
