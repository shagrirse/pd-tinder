import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	reconcile,
	type MemberRef,
	type PreferenceRef
} from '../../../src/lib/server/pairing/passes';

type Fixture = {
	source: string;
	members: { id: number; role: 'mentor' | 'mentee'; industry: string | null }[];
	preferences: PreferenceRef[];
	final: { mentorId: number; menteeId: number }[];
	handResolved: number[];
	expected: { members: number; submissions: number; finalPairs: number; unjoinable: number };
};

const fixture: Fixture = JSON.parse(
	readFileSync('tests/fixtures/pairing-9th-circle.json', 'utf8')
);

const roster: MemberRef[] = fixture.members.map((m) => ({ id: m.id, role: m.role }));
const result = reconcile(roster, fixture.preferences);

/** mentorId -> menteeId and menteeId -> mentorId, as PD actually shipped it. */
const shippedByMentor = new Map(fixture.final.map((p) => [p.mentorId, p.menteeId]));
const shippedByMentee = new Map(fixture.final.map((p) => [p.menteeId, p.mentorId]));

describe('the 9th Circle fixture', () => {
	it('matches the figures recorded when it was built', () => {
		expect(fixture.members).toHaveLength(fixture.expected.members);
		expect(fixture.final).toHaveLength(fixture.expected.finalPairs);
		expect(new Set(fixture.preferences.map((p) => p.memberId)).size).toBe(
			fixture.expected.submissions
		);
		// Spec §7.1: nothing remains unresolvable.
		expect(fixture.expected.unjoinable).toBe(0);
	});

	it('carries no names, emails or reasons', () => {
		const serialised = JSON.stringify(fixture.members);
		expect(serialised).not.toMatch(/@/);
		for (const pref of fixture.preferences) {
			expect(Object.keys(pref).sort()).toEqual(['choiceMemberId', 'memberId', 'rank']);
		}
	});
});

describe('replaying reconciliation over the 9th Circle', () => {
	it('contradicts none of the pairs PD shipped', () => {
		// Acceptance, spec §7.1: a produced pair may be absent from FINAL (PD
		// hand-resolved it differently), but it may never CONTRADICT FINAL by
		// pairing a mentor or a mentee with someone other than the person they
		// ended up with. Both sides of FINAL are checked, so a pair whose mentor
		// is absent from FINAL still contradicts if its mentee shipped elsewhere.
		const contradictions = result.pairs.filter((pair) => {
			const mentorActual = shippedByMentor.get(pair.mentorId);
			if (mentorActual !== undefined && mentorActual !== pair.menteeId) return true;
			const menteeActual = shippedByMentee.get(pair.menteeId);
			return menteeActual !== undefined && menteeActual !== pair.mentorId;
		});
		expect(contradictions).toEqual([]);
	});

	it('pairs nobody twice', () => {
		const mentors = result.pairs.map((p) => p.mentorId);
		const mentees = result.pairs.map((p) => p.menteeId);
		expect(new Set(mentors).size).toBe(mentors.length);
		expect(new Set(mentees).size).toBe(mentees.length);
	});

	it('reproduces most of FINAL through the mutual passes', () => {
		// Spec §2.4: 26 of 31 joinable pairs were mutual. The mutual passes should
		// therefore carry the clear majority of the reproduced pairs.
		const mutual = result.pairs.filter(
			(p) => p.method === 'mutual_first' || p.method === 'mutual_any'
		);
		const reproduced = result.pairs.filter((p) => shippedByMentor.get(p.mentorId) === p.menteeId);
		expect(mutual.length).toBeGreaterThan(result.pairs.length / 2);
		expect(reproduced.length).toBeGreaterThan(fixture.final.length / 2);
	});

	it('leaves a residual consistent with the pairs PD hand-resolved', () => {
		// Everyone the algorithm could not place must be someone PD placed by hand:
		// either in the hand-labelled block, or in a FINAL pair the preferences
		// cannot explain.
		const explainable = new Set<number>(fixture.handResolved);
		const unresolvable: number[] = [];
		for (const pair of fixture.final) {
			const namedEachOther = fixture.preferences.some(
				(p) =>
					(p.memberId === pair.mentorId && p.choiceMemberId === pair.menteeId) ||
					(p.memberId === pair.menteeId && p.choiceMemberId === pair.mentorId)
			);
			if (!namedEachOther) {
				explainable.add(pair.mentorId);
				explainable.add(pair.menteeId);
				unresolvable.push(pair.mentorId, pair.menteeId);
			}
		}
		const unexplained = result.unpaired.filter((id) => !explainable.has(id));
		expect(unexplained).toEqual([]);
		// Converse: no preference supports these pairs in either direction, so no
		// pass can produce them — every member of such a pair must sit in the
		// residual (spec §7.1: the residual is the four hand-labelled FINAL pairs).
		for (const id of unresolvable) {
			expect(result.unpaired).toContain(id);
		}
	});

	it('is deterministic', () => {
		const again = reconcile(roster, [...fixture.preferences].reverse());
		expect(again.pairs).toEqual(result.pairs);
		expect(again.unpaired).toEqual(result.unpaired);
	});
});
