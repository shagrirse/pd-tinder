import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../../helpers/db';
import { cycles, members, pairings } from '../../../src/lib/server/db/schema';
import { OverrideError, overridePair } from '../../../src/lib/server/pairing/override';
import type { AppDb } from '../../../src/lib/server/db';

let db: AppDb;
let mentors: number[];
let mentees: number[];

function addMember(cycleId: number, role: 'mentor' | 'mentee', n: number) {
	return db
		.insert(members)
		.values({ cycleId, role, fullName: `${role} ${n}`, email: `${role}${n}-${cycleId}@example.com` })
		.returning({ id: members.id })
		.get().id;
}

beforeEach(() => {
	db = makeTestDb();
	db.insert(cycles).values({ name: '10th Circle', year: 2026 }).run();
	mentors = [1, 2].map((n) => addMember(1, 'mentor', n));
	mentees = [1, 2].map((n) => addMember(1, 'mentee', n));
});

/**
 * Run `fn` and return the error code it throws. Vitest's `toThrow` cannot match
 * on a custom property, so read the code off the caught error instead.
 */
function codeOf(fn: () => void): string {
	try {
		fn();
	} catch (error) {
		return (error as OverrideError).code;
	}
	throw new Error('expected overridePair to throw, but it returned');
}

describe('overridePair', () => {
	it('creates a manual pair carrying its reason', () => {
		overridePair(db, 1, mentors[0], mentees[0], 'agreed at the mixer');
		const row = db.select().from(pairings).get()!;
		expect(row.method).toBe('manual');
		expect(row.overrideReason).toBe('agreed at the mixer');
		expect(row.mentorMemberId).toBe(mentors[0]);
		expect(row.menteeMemberId).toBe(mentees[0]);
	});

	it('requires a reason', () => {
		expect(codeOf(() => overridePair(db, 1, mentors[0], mentees[0], '   '))).toBe(
			'reason_required'
		);
		expect(db.select().from(pairings).all()).toEqual([]);
	});

	it('displaces both members from their existing pairs', () => {
		db
			.insert(pairings)
			.values([
				{ cycleId: 1, mentorMemberId: mentors[0], menteeMemberId: mentees[0], method: 'mutual_first' },
				{ cycleId: 1, mentorMemberId: mentors[1], menteeMemberId: mentees[1], method: 'mutual_any' }
			])
			.run();

		overridePair(db, 1, mentors[0], mentees[1], 'mentee asked to switch');

		const rows = db.select().from(pairings).all();
		expect(rows).toHaveLength(1);
		expect(rows[0].mentorMemberId).toBe(mentors[0]);
		expect(rows[0].menteeMemberId).toBe(mentees[1]);
		expect(rows[0].method).toBe('manual');
	});

	it('replaces an earlier override rather than duplicating it', () => {
		overridePair(db, 1, mentors[0], mentees[0], 'first call');
		overridePair(db, 1, mentors[0], mentees[0], 'second thoughts');
		const rows = db.select().from(pairings).all();
		expect(rows).toHaveLength(1);
		expect(rows[0].overrideReason).toBe('second thoughts');
	});

	it('rejects two members of the same role', () => {
		expect(codeOf(() => overridePair(db, 1, mentors[0], mentors[1], 'nonsense'))).toBe(
			'role_mismatch'
		);
	});

	it('rejects arguments given in the wrong order', () => {
		expect(codeOf(() => overridePair(db, 1, mentees[0], mentors[0], 'swapped'))).toBe(
			'role_mismatch'
		);
	});

	it('rejects a member from another cycle', () => {
		db.insert(cycles).values({ name: '11th Circle', year: 2027 }).run();
		const foreign = addMember(2, 'mentee', 9);
		expect(codeOf(() => overridePair(db, 1, mentors[0], foreign, 'wrong cycle'))).toBe(
			'wrong_cycle'
		);
	});

	it('rejects an unknown member', () => {
		expect(codeOf(() => overridePair(db, 1, mentors[0], 9999, 'ghost'))).toBe('not_found');
	});
});
