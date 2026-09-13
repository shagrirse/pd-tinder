import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '../../helpers/db';
import { cycles, members, pairings, preferences } from '../../../src/lib/server/db/schema';
import type { AppDb } from '../../../src/lib/server/db';

let db: AppDb;

beforeEach(() => {
	db = makeTestDb();
	db.insert(cycles).values({ name: '10th Circle', year: 2026 }).run();
});

function addMember(role: 'mentor' | 'mentee', email: string) {
	return db
		.insert(members)
		.values({ cycleId: 1, role, fullName: 'Fixture Person', email })
		.returning({ id: members.id })
		.get().id;
}

describe('members', () => {
	it('rejects a duplicate email within a cycle', () => {
		addMember('mentor', 'a@example.com');
		expect(() => addMember('mentee', 'a@example.com')).toThrow(/UNIQUE/i);
	});

	it('allows the same email in a different cycle', () => {
		addMember('mentor', 'a@example.com');
		db.insert(cycles).values({ name: '11th Circle', year: 2027 }).run();
		expect(() =>
			db
				.insert(members)
				.values({ cycleId: 2, role: 'mentor', fullName: 'Fixture Person', email: 'a@example.com' })
				.run()
		).not.toThrow();
	});

	it('defaults applicantId to null, because mentors are never applicants', () => {
		const id = addMember('mentor', 'a@example.com');
		const row = db.select().from(members).all().find((m) => m.id === id)!;
		expect(row.applicantId).toBeNull();
		expect(row.active).toBe(true);
	});
});

describe('preferences', () => {
	it('rejects two choices at the same rank', () => {
		const mentor = addMember('mentor', 'm@example.com');
		const a = addMember('mentee', 'a@example.com');
		const b = addMember('mentee', 'b@example.com');
		db.insert(preferences).values({ memberId: mentor, choiceMemberId: a, rank: 1 }).run();
		expect(() =>
			db.insert(preferences).values({ memberId: mentor, choiceMemberId: b, rank: 1 }).run()
		).toThrow(/UNIQUE/i);
	});

	it('rejects the same choice twice at different ranks', () => {
		const mentor = addMember('mentor', 'm@example.com');
		const a = addMember('mentee', 'a@example.com');
		db.insert(preferences).values({ memberId: mentor, choiceMemberId: a, rank: 1 }).run();
		expect(() =>
			db.insert(preferences).values({ memberId: mentor, choiceMemberId: a, rank: 2 }).run()
		).toThrow(/UNIQUE/i);
	});
});

describe('pairings', () => {
	it('allows one mentee per mentor and no more', () => {
		const mentor = addMember('mentor', 'm@example.com');
		const a = addMember('mentee', 'a@example.com');
		const b = addMember('mentee', 'b@example.com');
		db
			.insert(pairings)
			.values({ cycleId: 1, mentorMemberId: mentor, menteeMemberId: a, method: 'mutual_first' })
			.run();
		expect(() =>
			db
				.insert(pairings)
				.values({ cycleId: 1, mentorMemberId: mentor, menteeMemberId: b, method: 'mutual_first' })
				.run()
		).toThrow(/UNIQUE/i);
	});

	it('refuses to pair a mentee twice', () => {
		const m1 = addMember('mentor', 'm1@example.com');
		const m2 = addMember('mentor', 'm2@example.com');
		const mentee = addMember('mentee', 'a@example.com');
		db
			.insert(pairings)
			.values({ cycleId: 1, mentorMemberId: m1, menteeMemberId: mentee, method: 'mutual_any' })
			.run();
		expect(() =>
			db
				.insert(pairings)
				.values({ cycleId: 1, mentorMemberId: m2, menteeMemberId: mentee, method: 'mutual_any' })
				.run()
		).toThrow(/UNIQUE/i);
	});
});
