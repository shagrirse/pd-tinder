import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '../../helpers/db';
import { cycles, users } from '../../../src/lib/server/db/schema';
import { DEFAULT_COLUMN_MAPPING } from '../../../src/lib/server/import/columns';
import { parseCsv } from '../../../src/lib/server/import/parse';
import { commitImport } from '../../../src/lib/server/import/commit';
import { CLAIM_TTL_MS, claimNext } from '../../../src/lib/server/review/claim';
import { submitVerdict } from '../../../src/lib/server/review/verdict';
import { getIndustryProgress } from '../../../src/lib/server/results/progress';
import type { AppDb } from '../../../src/lib/server/db';

const parsed = parseCsv(readFileSync('tests/fixtures/applicants-sample.csv', 'utf8'));
let db: AppDb;

beforeEach(() => {
	db = makeTestDb();
	db.insert(cycles).values({ name: 'C', year: 2026, status: 'reviewing' }).run();
	commitImport(db, 1, parsed, DEFAULT_COLUMN_MAPPING);
	db.insert(users).values([
		{ name: 'One', email: 'one@example.com' },
		{ name: 'Two', email: 'two@example.com' }
	]).run();
});

describe('getIndustryProgress', () => {
	it('reports everything remaining before any review', () => {
		expect(getIndustryProgress(db, 1)).toEqual([
			{ industry: 'Finance', total: 2, reviewed: 0, claimed: 0, remaining: 2 }
		]);
	});

	it('counts a live claim as claimed, not remaining', () => {
		claimNext(db, 1, 1, ['Finance']);
		expect(getIndustryProgress(db, 1)).toEqual([
			{ industry: 'Finance', total: 2, reviewed: 0, claimed: 1, remaining: 1 }
		]);
	});

	it('counts a submitted verdict as reviewed and frees its claim', () => {
		claimNext(db, 1, 1, ['Finance']);
		submitVerdict(db, 1, 1, { overall: 'like', ratings: [] });
		expect(getIndustryProgress(db, 1)).toEqual([
			{ industry: 'Finance', total: 2, reviewed: 1, claimed: 0, remaining: 1 }
		]);
	});

	it('counts an expired claim as remaining', () => {
		const start = new Date('2026-08-25T00:00:00Z');
		claimNext(db, 1, 1, ['Finance'], start);
		const later = new Date(start.getTime() + CLAIM_TTL_MS + 1000);
		expect(getIndustryProgress(db, 1, later)).toEqual([
			{ industry: 'Finance', total: 2, reviewed: 0, claimed: 0, remaining: 2 }
		]);
	});

	it('reports a fully reviewed pool', () => {
		claimNext(db, 1, 1, ['Finance']);
		submitVerdict(db, 1, 1, { overall: 'like', ratings: [] });
		claimNext(db, 2, 1, ['Finance']);
		submitVerdict(db, 2, 2, { overall: 'skip', ratings: [] });
		expect(getIndustryProgress(db, 1)).toEqual([
			{ industry: 'Finance', total: 2, reviewed: 2, claimed: 0, remaining: 0 }
		]);
	});

	it('counts a red flag as reviewed', () => {
		claimNext(db, 1, 1, ['Finance']);
		submitVerdict(db, 1, 1, {
			overall: null,
			ratings: [],
			redFlag: true,
			redFlagReason: 'Disclosed intent to misuse the network.'
		});
		expect(getIndustryProgress(db, 1)[0]).toMatchObject({ reviewed: 1, remaining: 1 });
	});

	it('omits industries with no applicants', () => {
		expect(getIndustryProgress(db, 1).map((p) => p.industry)).toEqual(['Finance']);
	});

	it('does not count another cycle', () => {
		db.insert(cycles).values({ name: 'Other', year: 2027 }).run();
		expect(getIndustryProgress(db, 2)).toEqual([]);
	});
});
