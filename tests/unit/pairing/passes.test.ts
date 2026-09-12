import { describe, expect, it } from 'vitest';
import {
	mutualFirstPass,
	type MemberRef,
	type PreferenceRef
} from '../../../src/lib/server/pairing/passes';

/** Odd ids are mentors, even ids are mentees, so test data reads at a glance. */
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

describe('mutualFirstPass', () => {
	it('pairs two members who each ranked the other first', () => {
		const locked = new Set<number>();
		const pairs = mutualFirstPass(roster, [pref(1, 1, 2), pref(2, 1, 1)], locked);
		expect(pairs).toEqual([
			{ mentorId: 1, menteeId: 2, method: 'mutual_first', mentorRank: 1, menteeRank: 1 }
		]);
	});

	it('emits each pair once, not once per side', () => {
		const locked = new Set<number>();
		const pairs = mutualFirstPass(roster, [pref(1, 1, 2), pref(2, 1, 1)], locked);
		expect(pairs).toHaveLength(1);
	});

	it('locks both members so later passes skip them', () => {
		const locked = new Set<number>();
		mutualFirstPass(roster, [pref(1, 1, 2), pref(2, 1, 1)], locked);
		expect([...locked].sort((a, b) => a - b)).toEqual([1, 2]);
	});

	it('ignores a first choice that is not reciprocated at rank one', () => {
		const locked = new Set<number>();
		const pairs = mutualFirstPass(roster, [pref(1, 1, 2), pref(2, 2, 1)], locked);
		expect(pairs).toEqual([]);
	});

	it('ignores a reciprocated pair where neither choice is rank one', () => {
		const locked = new Set<number>();
		const pairs = mutualFirstPass(roster, [pref(1, 2, 2), pref(2, 2, 1)], locked);
		expect(pairs).toEqual([]);
	});

	it('never pairs two members of the same role', () => {
		const locked = new Set<number>();
		const pairs = mutualFirstPass(roster, [pref(1, 1, 3), pref(3, 1, 1)], locked);
		expect(pairs).toEqual([]);
	});

	it('skips a member already locked by a manual pair', () => {
		const locked = new Set<number>([1]);
		const pairs = mutualFirstPass(roster, [pref(1, 1, 2), pref(2, 1, 1)], locked);
		expect(pairs).toEqual([]);
	});

	it('emits pairs ordered by mentor id, since this pass can never be contested', () => {
		// Rank 1 is unique per member, so a member can appear in at most one mutual
		// first pair. Nothing is ever contested here — the sort only fixes the order.
		const locked = new Set<number>();
		const pairs = mutualFirstPass(
			roster,
			[pref(3, 1, 4), pref(4, 1, 3), pref(1, 1, 2), pref(2, 1, 1)],
			locked
		);
		expect(pairs.map((p) => [p.mentorId, p.menteeId])).toEqual([
			[1, 2],
			[3, 4]
		]);
	});

	it('is order-independent: shuffling the input changes nothing', () => {
		const input = [pref(1, 1, 2), pref(2, 1, 1), pref(3, 1, 4), pref(4, 1, 3)];
		const forward = mutualFirstPass(roster, input, new Set());
		const reversed = mutualFirstPass(roster, [...input].reverse(), new Set());
		expect(reversed).toEqual(forward);
	});
});
