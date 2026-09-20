import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '../../helpers/db';
import { cycles, members } from '../../../src/lib/server/db/schema';
import { listActiveRoster } from '../../../src/lib/server/roster/list';
import type { AppDb } from '../../../src/lib/server/db';

let db: AppDb;

function addMember(
	role: 'mentor' | 'mentee',
	overrides: Partial<{ cycleId: number; fullName: string; email: string; industry: string | null; active: boolean }> = {}
) {
	return db
		.insert(members)
		.values({
			cycleId: overrides.cycleId ?? 1,
			role,
			fullName: overrides.fullName ?? 'Fixture Person',
			email: overrides.email ?? `${role}-${Math.random()}@example.com`,
			industry: overrides.industry ?? null,
			active: overrides.active ?? true
		})
		.returning({ id: members.id })
		.get().id;
}

beforeEach(() => {
	db = makeTestDb();
	db.insert(cycles).values({ name: '10th Circle', year: 2026 }).run();
});

describe('listActiveRoster', () => {
	it('returns only active members of the given role and cycle', () => {
		addMember('mentor', { fullName: 'Active Mentor', email: 'active@example.com' });
		const inactiveId = addMember('mentor', {
			fullName: 'Retired Mentor',
			email: 'retired@example.com',
			active: false
		});
		addMember('mentee', { fullName: 'Some Mentee', email: 'mentee@example.com' });

		const roster = listActiveRoster(db, 1, 'mentor');

		expect(roster.map((m) => m.fullName)).toEqual(['Active Mentor']);
		expect(roster.every((m) => m.id !== inactiveId)).toBe(true);
	});

	it('excludes members from other cycles', () => {
		db.insert(cycles).values({ name: '11th Circle', year: 2027 }).run();
		addMember('mentor', { cycleId: 1, fullName: 'This Cycle', email: 'this@example.com' });
		addMember('mentor', { cycleId: 2, fullName: 'Other Cycle', email: 'other@example.com' });

		const roster = listActiveRoster(db, 1, 'mentor');

		expect(roster.map((m) => m.fullName)).toEqual(['This Cycle']);
	});

	it('orders results by industry, then by name', () => {
		addMember('mentor', { fullName: 'Zeta', industry: 'Finance', email: 'z@example.com' });
		addMember('mentor', { fullName: 'Amy', industry: 'Finance', email: 'a@example.com' });
		addMember('mentor', { fullName: 'Bo', industry: 'Consulting', email: 'b@example.com' });

		const roster = listActiveRoster(db, 1, 'mentor');

		expect(roster.map((m) => m.fullName)).toEqual(['Bo', 'Amy', 'Zeta']);
	});

	it('returns nothing for a cycle with no members', () => {
		expect(listActiveRoster(db, 1, 'mentor')).toEqual([]);
	});
});
