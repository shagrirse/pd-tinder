import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '../../helpers/db';
import { cycles, members, pairings, preferences } from '../../../src/lib/server/db/schema';
import { computeResidual, listPairings } from '../../../src/lib/server/pairing/list';
import type { AppDb } from '../../../src/lib/server/db';

let db: AppDb;
let mentors: number[];
let mentees: number[];

function addMember(role: 'mentor' | 'mentee', n: number) {
	return db
		.insert(members)
		.values({ cycleId: 1, role, fullName: `${role} ${n}`, email: `${role}${n}@example.com` })
		.returning({ id: members.id })
		.get().id;
}

beforeEach(() => {
	db = makeTestDb();
	db.insert(cycles).values({ name: '10th Circle', year: 2026 }).run();
	mentors = [1, 2].map((n) => addMember('mentor', n));
	mentees = [1, 2].map((n) => addMember('mentee', n));
});

describe('listPairings', () => {
	it('hydrates each pair with mentor and mentee names', () => {
		db.insert(pairings)
			.values({
				cycleId: 1,
				mentorMemberId: mentors[0],
				menteeMemberId: mentees[0],
				method: 'mutual_first'
			})
			.run();

		const rows = listPairings(db, 1);
		expect(rows).toHaveLength(1);
		expect(rows[0].mentor.fullName).toBe('mentor 1');
		expect(rows[0].mentee.fullName).toBe('mentee 1');
		expect(rows[0].method).toBe('mutual_first');
		expect(rows[0].overrideReason).toBeNull();
	});
});

describe('computeResidual', () => {
	it('lists roster members with no persisted pairing as unpaired', () => {
		db.insert(pairings)
			.values({
				cycleId: 1,
				mentorMemberId: mentors[0],
				menteeMemberId: mentees[0],
				method: 'mutual_first'
			})
			.run();

		const residual = computeResidual(db, 1);
		expect(residual.unpaired.map((m) => m.id).sort()).toEqual([mentors[1], mentees[1]].sort());
	});

	it('reflects an override immediately, without a reconciliation re-run', () => {
		db.insert(pairings)
			.values({
				cycleId: 1,
				mentorMemberId: mentors[0],
				menteeMemberId: mentees[0],
				method: 'mutual_first'
			})
			.run();
		// Simulate overridePair displacing mentor 1's original pair.
		db.delete(pairings).run();
		db.insert(pairings)
			.values({
				cycleId: 1,
				mentorMemberId: mentors[0],
				menteeMemberId: mentees[1],
				method: 'manual',
				overrideReason: 'switched at the mixer'
			})
			.run();

		const residual = computeResidual(db, 1);
		expect(residual.unpaired.map((m) => m.id).sort()).toEqual([mentors[1], mentees[0]].sort());
	});

	it('lists a paired member as gotNoChoice when their partner is not in their own preferences', () => {
		db.insert(preferences)
			.values({ memberId: mentors[0], choiceMemberId: mentees[1], rank: 1, reason: 'x' })
			.run();
		db.insert(pairings)
			.values({
				cycleId: 1,
				mentorMemberId: mentors[0],
				menteeMemberId: mentees[0],
				method: 'manual',
				overrideReason: 'forced pairing'
			})
			.run();

		const residual = computeResidual(db, 1);
		const ids = residual.gotNoChoice.map((m) => m.id);
		expect(ids).toContain(mentors[0]);
		expect(ids).toContain(mentees[0]);
	});
});
