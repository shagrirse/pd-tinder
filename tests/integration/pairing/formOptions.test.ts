import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '../../helpers/db';
import { cycles, members } from '../../../src/lib/server/db/schema';
import { listFormOptions } from '../../../src/lib/server/pairing/formOptions';
import type { AppDb } from '../../../src/lib/server/db';

let db: AppDb;

function addMember(
	cycleId: number,
	role: 'mentor' | 'mentee',
	fullName: string,
	email: string,
	active = true
) {
	db.insert(members).values({ cycleId, role, fullName, email, active }).run();
}

beforeEach(() => {
	db = makeTestDb();
	db.insert(cycles).values({ name: '10th Circle', year: 2026 }).run();
	db.insert(cycles).values({ name: 'Other', year: 2025 }).run();
});

describe('listFormOptions', () => {
	it('lists active members of the role alphabetically, exactly as stored', () => {
		addMember(1, 'mentee', 'Robin Mentee', 'r@example.com');
		addMember(1, 'mentee', 'Casey Mentee', 'c@example.com');
		addMember(1, 'mentor', 'Priya Mentor', 'p@example.com');

		expect(listFormOptions(db, 1, 'mentee').names).toEqual(['Casey Mentee', 'Robin Mentee']);
		expect(listFormOptions(db, 1, 'mentor').names).toEqual(['Priya Mentor']);
	});

	it('leaves out inactive members and other cycles', () => {
		addMember(1, 'mentee', 'Active Mentee', 'a@example.com');
		addMember(1, 'mentee', 'Gone Mentee', 'g@example.com', false);
		addMember(2, 'mentee', 'Elsewhere Mentee', 'e@example.com');

		expect(listFormOptions(db, 1, 'mentee').names).toEqual(['Active Mentee']);
	});

	it('flags names that collide once normalised', () => {
		addMember(1, 'mentee', 'Jordan Mentee', 'j1@example.com');
		addMember(1, 'mentee', 'Jordan Mentee ', 'j2@example.com');

		expect(listFormOptions(db, 1, 'mentee').duplicates).toEqual([
			{ name: 'Jordan Mentee', count: 2 }
		]);
	});
});
