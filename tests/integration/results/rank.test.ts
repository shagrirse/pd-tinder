import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../../helpers/db';
import { cycles, questions, users } from '../../../src/lib/server/db/schema';
import { DEFAULT_COLUMN_MAPPING } from '../../../src/lib/server/import/columns';
import { parseCsv } from '../../../src/lib/server/import/parse';
import { commitImport } from '../../../src/lib/server/import/commit';
import { claimNext } from '../../../src/lib/server/review/claim';
import { submitVerdict } from '../../../src/lib/server/review/verdict';
import { rankCycle } from '../../../src/lib/server/results/rank';
import type { AppDb } from '../../../src/lib/server/db';

const parsed = parseCsv(readFileSync('tests/fixtures/applicants-sample.csv', 'utf8'));
let db: AppDb;
let ratedIds: number[];

beforeEach(() => {
	db = makeTestDb();
	db.insert(cycles).values({ name: 'C', year: 2026, status: 'reviewing' }).run();
	commitImport(db, 1, parsed, DEFAULT_COLUMN_MAPPING);
	db.insert(users).values({ name: 'Reviewer One', email: 'one@example.com' }).run();
	ratedIds = db
		.select({ id: questions.id })
		.from(questions)
		.where(eq(questions.isRated, true))
		.all()
		.map((q) => q.id);
});

describe('rankCycle', () => {
	it('starts with everyone pending', () => {
		const [finance] = rankCycle(db, 1);
		expect(finance.industry).toBe('Finance');
		expect(finance.pending).toHaveLength(2);
		expect(finance.ranked).toHaveLength(0);
		expect(finance.rejected).toHaveLength(0);
	});

	it('ranks a reviewed applicant with their score, coverage, and reviewer', () => {
		claimNext(db, 1, 1, ['Finance']);
		submitVerdict(db, 1, 1, {
			overall: 'like',
			ratings: [
				{ questionId: ratedIds[0], value: 'like' },
				{ questionId: ratedIds[1], value: 'meh' }
			]
		});

		const [finance] = rankCycle(db, 1);
		expect(finance.ranked).toHaveLength(1);
		expect(finance.ranked[0]).toMatchObject({
			publicRef: 1,
			fullName: 'Ada Fictional',
			score: 0.5,
			rated: 2,
			total: 8,
			overall: 'like',
			reviewerName: 'Reviewer One'
		});
		expect(finance.pending).toHaveLength(1);
	});

	it('sends a red-flagged applicant to rejected regardless of score', () => {
		claimNext(db, 1, 1, ['Finance']);
		submitVerdict(db, 1, 1, {
			overall: null,
			ratings: ratedIds.map((questionId) => ({ questionId, value: 'like' as const })),
			redFlag: true,
			redFlagReason: 'Disclosed intent to misuse the network.'
		});

		const [finance] = rankCycle(db, 1);
		expect(finance.ranked).toHaveLength(0);
		expect(finance.rejected).toHaveLength(1);
		expect(finance.rejected[0].redFlagReason).toContain('misuse');
	});

	it('orders the ranked bucket by score descending', () => {
		claimNext(db, 1, 1, ['Finance']);
		submitVerdict(db, 1, 1, {
			overall: 'skip',
			ratings: [{ questionId: ratedIds[0], value: 'skip' }]
		});
		claimNext(db, 1, 1, ['Finance']);
		submitVerdict(db, 1, 2, {
			overall: 'like',
			ratings: [{ questionId: ratedIds[0], value: 'like' }]
		});

		const [finance] = rankCycle(db, 1);
		expect(finance.ranked.map((r) => r.publicRef)).toEqual([2, 1]);
	});

	it('returns no entry for an industry with no applicants', () => {
		expect(rankCycle(db, 1).map((r) => r.industry)).toEqual(['Finance']);
	});

	it('carries names into the pending bucket too', () => {
		const [finance] = rankCycle(db, 1);
		expect(finance.pending.map((p) => p.fullName)).toEqual(['Ada Fictional', 'Bo Fictional']);
	});
});
