import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../../helpers/db';
import { cycles, members, preferences } from '../../../src/lib/server/db/schema';
import { PreferenceError, setPreferences } from '../../../src/lib/server/pairing/preferences';
import type { AppDb } from '../../../src/lib/server/db';

let db: AppDb;
let mentor: number;
let mentees: number[];

function addMember(cycleId: number, role: 'mentor' | 'mentee', email: string) {
	return db
		.insert(members)
		.values({ cycleId, role, fullName: 'Fixture Person', email })
		.returning({ id: members.id })
		.get().id;
}

beforeEach(() => {
	db = makeTestDb();
	db.insert(cycles).values({ name: '10th Circle', year: 2026 }).run();
	mentor = addMember(1, 'mentor', 'mentor@example.com');
	mentees = [
		addMember(1, 'mentee', 'a@example.com'),
		addMember(1, 'mentee', 'b@example.com'),
		addMember(1, 'mentee', 'c@example.com'),
		addMember(1, 'mentee', 'd@example.com')
	];
});

function threeChoices(ids: number[]) {
	return ids.map((choiceMemberId, i) => ({
		rank: (i + 1) as 1 | 2 | 3,
		choiceMemberId,
		reason: `reason ${i + 1}`
	}));
}

/**
 * Run `fn` and return the error code it throws. Vitest's `toThrow` cannot match
 * on a custom property, so read the code off the caught error instead.
 */
function codeOf(fn: () => void): string {
	try {
		fn();
	} catch (error) {
		return (error as PreferenceError).code;
	}
	throw new Error('expected setPreferences to throw, but it returned');
}

describe('setPreferences', () => {
	it('stores three ranked choices with their reasons', () => {
		setPreferences(db, mentor, threeChoices(mentees.slice(0, 3)));
		const rows = db.select().from(preferences).all();
		expect(rows).toHaveLength(3);
		expect(rows.map((r) => [r.rank, r.choiceMemberId])).toEqual([
			[1, mentees[0]],
			[2, mentees[1]],
			[3, mentees[2]]
		]);
		expect(rows[0].reason).toBe('reason 1');
	});

	it('replaces an earlier submission rather than appending to it', () => {
		setPreferences(db, mentor, threeChoices(mentees.slice(0, 3)));
		setPreferences(db, mentor, threeChoices(mentees.slice(1, 4)));
		const rows = db.select().from(preferences).all();
		expect(rows).toHaveLength(3);
		expect(rows.map((r) => r.choiceMemberId).sort((a, b) => a - b)).toEqual(
			mentees.slice(1, 4).sort((a, b) => a - b)
		);
	});

	it('requires exactly three choices', () => {
		expect(codeOf(() => setPreferences(db, mentor, threeChoices(mentees.slice(0, 2))))).toBe(
			'incomplete'
		);
	});

	it('requires ranks 1, 2 and 3 exactly', () => {
		const choices = threeChoices(mentees.slice(0, 3));
		choices[2].rank = 2 as 1 | 2 | 3;
		expect(codeOf(() => setPreferences(db, mentor, choices))).toBe('incomplete');
	});

	it('rejects the same member chosen twice', () => {
		expect(
			codeOf(() => setPreferences(db, mentor, threeChoices([mentees[0], mentees[0], mentees[1]])))
		).toBe('duplicate_choice');
	});

	it('rejects a choice of the same role', () => {
		const otherMentor = addMember(1, 'mentor', 'mentor2@example.com');
		expect(
			codeOf(() => setPreferences(db, mentor, threeChoices([mentees[0], mentees[1], otherMentor])))
		).toBe('same_role');
	});

	it('rejects a choice from another cycle', () => {
		db.insert(cycles).values({ name: '11th Circle', year: 2027 }).run();
		const foreign = addMember(2, 'mentee', 'foreign@example.com');
		expect(
			codeOf(() => setPreferences(db, mentor, threeChoices([mentees[0], mentees[1], foreign])))
		).toBe('wrong_cycle');
	});

	it('rejects an unknown member', () => {
		expect(codeOf(() => setPreferences(db, 9999, threeChoices(mentees.slice(0, 3))))).toBe(
			'not_found'
		);
	});

	it('rejects an inactive member', () => {
		db.update(members).set({ active: false }).where(eq(members.id, mentor)).run();
		expect(codeOf(() => setPreferences(db, mentor, threeChoices(mentees.slice(0, 3))))).toBe(
			'inactive'
		);
	});

	it('leaves the earlier submission intact when the new one is invalid', () => {
		setPreferences(db, mentor, threeChoices(mentees.slice(0, 3)));
		expect(() => setPreferences(db, mentor, threeChoices(mentees.slice(0, 2)))).toThrow();
		expect(db.select().from(preferences).all()).toHaveLength(3);
	});
});
