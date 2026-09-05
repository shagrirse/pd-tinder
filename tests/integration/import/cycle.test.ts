import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '../../helpers/db';
import { cycles } from '../../../src/lib/server/db/schema';
import { getActiveCycle, listCycles } from '../../../src/lib/server/import/cycle';
import type { AppDb } from '../../../src/lib/server/db';

let db: AppDb;

beforeEach(() => {
	db = makeTestDb();
});

describe('listCycles', () => {
	it('is empty when none exist', () => {
		expect(listCycles(db)).toEqual([]);
	});

	it('lists every cycle regardless of status', () => {
		db.insert(cycles).values([
			{ name: 'Draft', year: 2027, status: 'draft' },
			{ name: 'Open', year: 2026, status: 'reviewing' },
			{ name: 'Done', year: 2025, status: 'closed' }
		]).run();

		expect(listCycles(db).map((c) => c.status)).toEqual(['draft', 'reviewing', 'closed']);
	});

	it('orders newest year first', () => {
		db.insert(cycles).values([
			{ name: 'Older', year: 2024 },
			{ name: 'Newest', year: 2027 },
			{ name: 'Middle', year: 2025 }
		]).run();

		expect(listCycles(db).map((c) => c.name)).toEqual(['Newest', 'Middle', 'Older']);
	});

	it('carries the fields the wizard needs', () => {
		db.insert(cycles).values({ name: 'Mentee Recruitment 2026', year: 2026 }).run();
		expect(listCycles(db)[0]).toEqual({
			id: 1,
			name: 'Mentee Recruitment 2026',
			year: 2026,
			status: 'draft'
		});
	});
});

describe('getActiveCycle is unchanged', () => {
	it('still returns only a reviewing cycle', () => {
		db.insert(cycles).values([
			{ name: 'Draft', year: 2027, status: 'draft' },
			{ name: 'Open', year: 2026, status: 'reviewing' }
		]).run();

		expect(getActiveCycle(db)?.name).toBe('Open');
	});
});
