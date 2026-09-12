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

/** mentorId -> menteeId, as PD actually shipped it. */
const shipped = new Map(fixture.final.map((p) => [p.mentorId, p.menteeId]));

describe('the 9th Circle fixture', () => {
	it('matches the figures recorded when it was built', () => {
		expect(fixture.members).toHaveLength(fixture.expected.members);
		expect(fixture.final).toHaveLength(fixture.expected.finalPairs);
		expect(new Set(fixture.preferences.map((p) => p.memberId)).size).toBe(
			fixture.expected.submissions
		);
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
		// pairing a mentor with someone other than the mentee they ended up with.
		const contradictions = result.pairs.filter((pair) => {
			const actual = shipped.get(pair.mentorId);
			return actual !== undefined && actual !== pair.menteeId;
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
		const reproduced = result.pairs.filter((p) => shipped.get(p.mentorId) === p.menteeId);
		expect(mutual.length).toBeGreaterThan(result.pairs.length / 2);
		expect(reproduced.length).toBeGreaterThan(fixture.final.length / 2);
	});

	it('leaves a residual consistent with the pairs PD hand-resolved', () => {
		// Everyone the algorithm could not place must be someone PD placed by hand:
		// either in the hand-labelled block, or in a FINAL pair the preferences
		// cannot explain.
		const explainable = new Set<number>(fixture.handResolved);
		for (const pair of fixture.final) {
			const namedEachOther = fixture.preferences.some(
				(p) =>
					(p.memberId === pair.mentorId && p.choiceMemberId === pair.menteeId) ||
					(p.memberId === pair.menteeId && p.choiceMemberId === pair.mentorId)
			);
			if (!namedEachOther) {
				explainable.add(pair.mentorId);
				explainable.add(pair.menteeId);
			}
		}
		const unexplained = result.unpaired.filter((id) => !explainable.has(id));
		expect(unexplained).toEqual([]);
	});

	it('is deterministic', () => {
		const again = reconcile(roster, [...fixture.preferences].reverse());
		expect(again.pairs).toEqual(result.pairs);
		expect(again.unpaired).toEqual(result.unpaired);
	});
});
