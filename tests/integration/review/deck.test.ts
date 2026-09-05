import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '../../helpers/db';
import { cycles, users } from '../../../src/lib/server/db/schema';
import { DEFAULT_COLUMN_MAPPING } from '../../../src/lib/server/import/columns';
import { parseCsv } from '../../../src/lib/server/import/parse';
import { commitImport } from '../../../src/lib/server/import/commit';
import { getActiveCycle } from '../../../src/lib/server/import/cycle';
import { getDeckProgress } from '../../../src/lib/server/review/deck';
import { claimNext } from '../../../src/lib/server/review/claim';
import { submitVerdict } from '../../../src/lib/server/review/verdict';
import type { AppDb } from '../../../src/lib/server/db';

const parsed = parseCsv(readFileSync('tests/fixtures/applicants-sample.csv', 'utf8'));
let db: AppDb;

beforeEach(() => {
	db = makeTestDb();
	db.insert(cycles).values({ name: 'Mentee Recruitment 2026', year: 2026, status: 'reviewing' }).run();
	commitImport(db, 1, parsed, DEFAULT_COLUMN_MAPPING);
	db.insert(users).values({ name: 'One', email: 'one@example.com' }).run();
});

describe('getActiveCycle', () => {
	it('returns the cycle that is open for reviewing', () => {
		expect(getActiveCycle(db)?.name).toBe('Mentee Recruitment 2026');
	});

	it('returns null when no cycle is open', () => {
		const empty = makeTestDb();
		empty.insert(cycles).values({ name: 'Draft', year: 2027, status: 'draft' }).run();
		expect(getActiveCycle(empty)).toBeNull();
	});
});

describe('getDeckProgress', () => {
	it('reports the whole pool as remaining before any review', () => {
		expect(getDeckProgress(db, 1, 1, ['Finance'])).toEqual({
			reviewedByMe: 0,
			remaining: 2,
			poolSize: 2
		});
	});

	it('counts a submitted verdict and shrinks remaining', () => {
		claimNext(db, 1, 1, ['Finance']);
		submitVerdict(db, 1, 1, { overall: 'like', ratings: [] });
		expect(getDeckProgress(db, 1, 1, ['Finance'])).toEqual({
			reviewedByMe: 1,
			remaining: 1,
			poolSize: 2
		});
	});

	it('counts only the industries the reviewer is assigned', () => {
		expect(getDeckProgress(db, 1, 1, ['Tech'])).toEqual({
			reviewedByMe: 0,
			remaining: 0,
			poolSize: 0
		});
	});
});
