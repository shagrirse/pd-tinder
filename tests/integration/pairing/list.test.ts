import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
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

	it('resolves gotNoChoice members from full roster even if deactivated', () => {
		// Create a pairing where mentor[0] is paired with mentee[0]
		db.insert(pairings)
			.values({
				cycleId: 1,
				mentorMemberId: mentors[0],
				menteeMemberId: mentees[0],
				method: 'manual',
				overrideReason: 'forced'
			})
			.run();

		// Add preferences so mentor[0] did NOT choose mentee[0] — this puts them in gotNoChoice
		db.insert(preferences)
			.values({ memberId: mentors[0], choiceMemberId: mentees[1], rank: 1, reason: 'x' })
			.run();

		// Deactivate mentor[0]
		db.update(members).set({ active: false }).where(eq(members.id, mentors[0])).run();

		// computeResidual should resolve members from full roster, not active-only
		const residual = computeResidual(db, 1);

		// The deactivated mentor should not appear in unpaired (only active members)
		expect(residual.unpaired.map((m) => m.id)).not.toContain(mentors[0]);

		// But mentor[0] SHOULD be in gotNoChoice because they're paired but didn't choose their partner
		const gotNoChoiceIds = residual.gotNoChoice.map((m) => m.id);
		expect(gotNoChoiceIds).toContain(mentors[0]);

		// The key fix: fullName must be resolved (not undefined), proving the full roster lookup worked
		const deactivatedMemberInGotNoChoice = residual.gotNoChoice.find((m) => m.id === mentors[0]);
		expect(deactivatedMemberInGotNoChoice).toBeDefined();
		expect(deactivatedMemberInGotNoChoice!.fullName).toBe('mentor 1');
	});
});
