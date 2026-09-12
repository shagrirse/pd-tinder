import { describe, expect, it } from 'vitest';
import {
	mutualFirstPass,
	mutualAnyPass,
	oneSidedPass,
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

describe('mutualAnyPass', () => {
	it('pairs two members who named each other at any rank', () => {
		const locked = new Set<number>();
		const pairs = mutualAnyPass(roster, [pref(1, 2, 2), pref(2, 3, 1)], locked);
		expect(pairs).toEqual([
			{ mentorId: 1, menteeId: 2, method: 'mutual_any', mentorRank: 2, menteeRank: 3 }
		]);
	});

	it('processes candidates in ascending combined rank', () => {
		// 1<->2 is 2+2=4; 3<->4 is 1+2=3. The cheaper pair is taken first, but both
		// survive because they share no member.
		const locked = new Set<number>();
		const pairs = mutualAnyPass(
			roster,
			[pref(1, 2, 2), pref(2, 2, 1), pref(3, 1, 4), pref(4, 2, 3)],
			locked
		);
		expect(pairs.map((p) => [p.mentorId, p.menteeId])).toEqual([
			[3, 4],
			[1, 2]
		]);
	});

	it('lets the lower combined rank win a contested member', () => {
		// Mentee 2 is named back by both mentor 1 (combined 4) and mentor 3
		// (combined 2). Mentor 3 wins; mentor 1 is left for a later pass.
		const locked = new Set<number>();
		const pairs = mutualAnyPass(
			roster,
			[pref(1, 2, 2), pref(2, 2, 1), pref(3, 1, 2), pref(2, 1, 3)],
			locked
		);
		expect(pairs).toEqual([
			{ mentorId: 3, menteeId: 2, method: 'mutual_any', mentorRank: 1, menteeRank: 1 }
		]);
		expect(locked.has(1)).toBe(false);
	});

	it('breaks a genuine combined-rank tie on mentor id ascending', () => {
		// 3<->2 costs 1+2 and 5<->2 costs 2+1. Both want mentee 2 at the same combined
		// rank, so the lower mentor id takes them.
		const locked = new Set<number>();
		const pairs = mutualAnyPass(
			roster,
			[pref(3, 1, 2), pref(2, 2, 3), pref(5, 2, 2), pref(2, 1, 5)],
			locked
		);
		expect(pairs).toEqual([
			{ mentorId: 3, menteeId: 2, method: 'mutual_any', mentorRank: 1, menteeRank: 2 }
		]);
	});

	it('ignores a one-sided choice', () => {
		const locked = new Set<number>();
		expect(mutualAnyPass(roster, [pref(1, 1, 2)], locked)).toEqual([]);
	});

	it('is order-independent', () => {
		const input = [pref(1, 2, 2), pref(2, 2, 1), pref(3, 1, 4), pref(4, 2, 3)];
		const forward = mutualAnyPass(roster, input, new Set());
		const reversed = mutualAnyPass(roster, [...input].reverse(), new Set());
		expect(reversed).toEqual(forward);
	});
});

describe('oneSidedPass', () => {
	it('pairs a member with someone who did not name them back', () => {
		const locked = new Set<number>();
		const pairs = oneSidedPass(roster, [pref(1, 1, 2)], locked);
		expect(pairs).toEqual([
			{ mentorId: 1, menteeId: 2, method: 'one_sided', mentorRank: 1, menteeRank: null }
		]);
	});

	it('records which side did the naming when it was the mentee', () => {
		const locked = new Set<number>();
		const pairs = oneSidedPass(roster, [pref(2, 3, 1)], locked);
		expect(pairs).toEqual([
			{ mentorId: 1, menteeId: 2, method: 'one_sided', mentorRank: null, menteeRank: 3 }
		]);
	});

	it('processes candidates in ascending rank', () => {
		const locked = new Set<number>();
		const pairs = oneSidedPass(roster, [pref(1, 3, 2), pref(3, 1, 4)], locked);
		expect(pairs.map((p) => [p.mentorId, p.menteeId])).toEqual([
			[3, 4],
			[1, 2]
		]);
	});

	it('lets the lower rank win a contested member', () => {
		const locked = new Set<number>();
		const pairs = oneSidedPass(roster, [pref(1, 3, 2), pref(3, 1, 2)], locked);
		expect(pairs).toEqual([
			{ mentorId: 3, menteeId: 2, method: 'one_sided', mentorRank: 1, menteeRank: null }
		]);
	});

	it('ignores a mutual choice, which pass two already owns', () => {
		const locked = new Set<number>();
		expect(oneSidedPass(roster, [pref(1, 1, 2), pref(2, 1, 1)], locked)).toEqual([]);
	});

	it('is order-independent', () => {
		const input = [pref(1, 3, 2), pref(3, 1, 4), pref(5, 2, 6)];
		const forward = oneSidedPass(roster, input, new Set());
		const reversed = oneSidedPass(roster, [...input].reverse(), new Set());
		expect(reversed).toEqual(forward);
	});
});
