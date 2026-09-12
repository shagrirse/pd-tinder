import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../../helpers/db';
import { cycles, members, pairings } from '../../../src/lib/server/db/schema';
import { setPreferences } from '../../../src/lib/server/pairing/preferences';
import { runReconciliation } from '../../../src/lib/server/pairing/run';
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
	mentors = [1, 2, 3].map((n) => addMember('mentor', n));
	mentees = [1, 2, 3].map((n) => addMember('mentee', n));
});

/** Rank the three mentees in the given order for one mentor, and vice versa. */
function choices(ids: number[]) {
	return ids.map((choiceMemberId, i) => ({
		rank: (i + 1) as 1 | 2 | 3,
		choiceMemberId,
		reason: 'because'
	}));
}

describe('runReconciliation', () => {
	beforeEach(() => {
		// mentor0 <-> mentee0 mutual first. mentor1 <-> mentee1 mutual at 2/2.
		// mentor2 names mentee2 first; mentee2 names nobody back at any rank.
		setPreferences(db, mentors[0], choices([mentees[0], mentees[1], mentees[2]]));
		setPreferences(db, mentees[0], choices([mentors[0], mentors[1], mentors[2]]));
		setPreferences(db, mentors[1], choices([mentees[0], mentees[1], mentees[2]]));
		setPreferences(db, mentees[1], choices([mentors[0], mentors[1], mentors[2]]));
		setPreferences(db, mentors[2], choices([mentees[2], mentees[0], mentees[1]]));
	});

	it('writes a pairing row per pair with the method that produced it', () => {
		runReconciliation(db, 1);
		const rows = db.select().from(pairings).all();
		expect(rows).toHaveLength(3);
		expect(
			rows.map((r) => [r.mentorMemberId, r.menteeMemberId, r.method]).sort()
		).toEqual(
			[
				[mentors[0], mentees[0], 'mutual_first'],
				[mentors[1], mentees[1], 'mutual_any'],
				[mentors[2], mentees[2], 'one_sided']
			].sort()
		);
	});

	it('returns the residual alongside the pairs', () => {
		const result = runReconciliation(db, 1);
		expect(result.unpaired).toEqual([]);
		// mentee2 was named but named nobody, so they got none of their choices.
		expect(result.gotNoChoice).toEqual([mentees[2]]);
	});

	it('is idempotent: a second run produces the same pairs', () => {
		const first = runReconciliation(db, 1);
		const second = runReconciliation(db, 1);
		expect(second.pairs).toEqual(first.pairs);
		expect(db.select().from(pairings).all()).toHaveLength(3);
	});

	it('never overwrites a manual pair', () => {
		db
			.insert(pairings)
			.values({
				cycleId: 1,
				mentorMemberId: mentors[0],
				menteeMemberId: mentees[2],
				method: 'manual',
				overrideReason: 'agreed at the mixer'
			})
			.run();

		runReconciliation(db, 1);

		const manual = db
			.select()
			.from(pairings)
			.where(eq(pairings.method, 'manual'))
			.all();
		expect(manual).toHaveLength(1);
		expect(manual[0].menteeMemberId).toBe(mentees[2]);
		expect(manual[0].overrideReason).toBe('agreed at the mixer');
	});

	it('keeps a manually paired member out of the residual', () => {
		db
			.insert(pairings)
			.values({
				cycleId: 1,
				mentorMemberId: mentors[0],
				menteeMemberId: mentees[2],
				method: 'manual'
			})
			.run();
		const result = runReconciliation(db, 1);
		expect(result.unpaired).not.toContain(mentors[0]);
		expect(result.unpaired).not.toContain(mentees[2]);
	});

	it('ignores inactive members', () => {
		db.update(members).set({ active: false }).where(eq(members.id, mentors[0])).run();
		const result = runReconciliation(db, 1);
		expect(result.pairs.some((p) => p.mentorId === mentors[0])).toBe(false);
		expect(result.unpaired).not.toContain(mentors[0]);
	});

	it('ignores another cycle entirely', () => {
		runReconciliation(db, 1);
		db.insert(cycles).values({ name: '11th Circle', year: 2027 }).run();
		const result = runReconciliation(db, 2);
		expect(result.pairs).toEqual([]);
		expect(result.unpaired).toEqual([]);
		expect(db.select().from(pairings).all()).toHaveLength(3);
	});
});
