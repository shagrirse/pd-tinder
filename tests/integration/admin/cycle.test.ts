import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '../../helpers/db';
import { cycles } from '../../../src/lib/server/db/schema';
import { getActiveCycle } from '../../../src/lib/server/import/cycle';
import { createCycle } from '../../../src/lib/server/admin/cycle';
import type { AppDb } from '../../../src/lib/server/db';

let db: AppDb;

beforeEach(() => {
	db = makeTestDb();
});

describe('createCycle', () => {
	it('creates a cycle in the reviewing state', () => {
		const result = createCycle(db, { name: 'Mentee Recruitment 2026', year: 2026 })!;
		expect(result.cycleId).toBe(1);

		const cycle = db.select().from(cycles).get()!;
		expect(cycle.name).toBe('Mentee Recruitment 2026');
		expect(cycle.year).toBe(2026);
		expect(cycle.status).toBe('reviewing');
	});

	it('is visible to getActiveCycle', () => {
		createCycle(db, { name: 'Mentee Recruitment 2026', year: 2026 });
		expect(getActiveCycle(db)).toEqual({
			id: 1,
			name: 'Mentee Recruitment 2026'
		});
	});

	it('writes nothing when a reviewing cycle already exists', () => {
		db.insert(cycles).values({ name: 'Existing', year: 2026, status: 'reviewing' }).run();

		expect(createCycle(db, { name: 'Second', year: 2027 })).toBeNull();
		expect(db.select().from(cycles).all()).toHaveLength(1);
	});

	it('creates again when the only cycles are draft or closed', () => {
		db.insert(cycles).values({ name: 'Draft', year: 2026, status: 'draft' }).run();
		db.insert(cycles).values({ name: 'Closed', year: 2025, status: 'closed' }).run();

		const result = createCycle(db, { name: 'New Cycle', year: 2027 })!;
		expect(result.cycleId).toBe(3);
		expect(db.select().from(cycles).all()).toHaveLength(3);
	});

	it('trims the name', () => {
		createCycle(db, { name: '  Mentee Recruitment 2026  ', year: 2026 });
		expect(db.select().from(cycles).get()!.name).toBe('Mentee Recruitment 2026');
	});

	it('rejects a blank name', () => {
		expect(() => createCycle(db, { name: '   ', year: 2026 })).toThrow();
		expect(db.select().from(cycles).all()).toHaveLength(0);
	});

	it('rejects a non-integer year', () => {
		expect(() => createCycle(db, { name: 'A', year: 2026.5 })).toThrow();
		expect(db.select().from(cycles).all()).toHaveLength(0);
	});

	it('rejects an out-of-range year', () => {
		expect(() => createCycle(db, { name: 'A', year: 1900 })).toThrow();
		expect(db.select().from(cycles).all()).toHaveLength(0);
	});
});
