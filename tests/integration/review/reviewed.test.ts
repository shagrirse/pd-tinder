import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../../helpers/db';
import { cycles, questions, users } from '../../../src/lib/server/db/schema';
import { DEFAULT_COLUMN_MAPPING } from '../../../src/lib/server/import/columns';
import { parseCsv } from '../../../src/lib/server/import/parse';
import { commitImport } from '../../../src/lib/server/import/commit';
import { CLAIM_TTL_MS, claimNext, hadExpiredClaim } from '../../../src/lib/server/review/claim';
import { submitVerdict } from '../../../src/lib/server/review/verdict';
import {
	getMySummary,
	getMyVerdict,
	listReviewedByUser
} from '../../../src/lib/server/review/reviewed';
import type { AppDb } from '../../../src/lib/server/db';

const parsed = parseCsv(readFileSync('tests/fixtures/applicants-sample.csv', 'utf8'));
let db: AppDb;
let ratedIds: number[];

beforeEach(() => {
	db = makeTestDb();
	db.insert(cycles).values({ name: 'C', year: 2026, status: 'reviewing' }).run();
	commitImport(db, 1, parsed, DEFAULT_COLUMN_MAPPING);
	db.insert(users).values([
		{ name: 'One', email: 'one@example.com' },
		{ name: 'Two', email: 'two@example.com' }
	]).run();
	ratedIds = db
		.select({ id: questions.id })
		.from(questions)
		.where(eq(questions.isRated, true))
		.all()
		.map((q) => q.id);
});

describe('listReviewedByUser', () => {
	it('is empty before anything is submitted', () => {
		expect(listReviewedByUser(db, 1, 1)).toEqual([]);
	});

	it('lists what the reviewer submitted, with rated counts', () => {
		claimNext(db, 1, 1, ['Finance']);
		submitVerdict(db, 1, 1, {
			overall: 'like',
			ratings: [
				{ questionId: ratedIds[0], value: 'like' },
				{ questionId: ratedIds[1], value: 'meh' }
			]
		});

		const items = listReviewedByUser(db, 1, 1);
		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({
			applicantId: 1,
			publicRef: 1,
			industry1: 'Finance',
			overall: 'like',
			redFlag: false,
			ratedCount: 2
		});
	});

	it('excludes other reviewers submissions', () => {
		claimNext(db, 2, 1, ['Finance']);
		submitVerdict(db, 2, 1, { overall: 'like', ratings: [] });
		expect(listReviewedByUser(db, 1, 1)).toEqual([]);
	});
});

describe('getMySummary', () => {
	it('is all zeroes before anything is submitted', () => {
		expect(getMySummary(db, 1, 1)).toEqual({ total: 0, like: 0, meh: 0, skip: 0, redFlags: 0 });
	});

	it('counts verdicts by kind, including red flags', () => {
		claimNext(db, 1, 1, ['Finance']);
		submitVerdict(db, 1, 1, { overall: 'like', ratings: [] });
		claimNext(db, 1, 1, ['Finance']);
		submitVerdict(db, 1, 2, {
			overall: null,
			ratings: [],
			redFlag: true,
			redFlagReason: 'Disclosed intent to misuse the network.'
		});

		expect(getMySummary(db, 1, 1)).toEqual({ total: 2, like: 1, meh: 0, skip: 0, redFlags: 1 });
	});
});

describe('hadExpiredClaim', () => {
	it('is false while the claim is live', () => {
		claimNext(db, 1, 1, ['Finance']);
		expect(hadExpiredClaim(db, 1)).toBe(false);
	});

	it('is true once the claim has timed out', () => {
		const start = new Date('2026-08-25T00:00:00Z');
		claimNext(db, 1, 1, ['Finance'], start);
		const later = new Date(start.getTime() + CLAIM_TTL_MS + 1000);
		expect(hadExpiredClaim(db, 1, later)).toBe(true);
	});

	it('is false when the reviewer holds nothing', () => {
		expect(hadExpiredClaim(db, 1)).toBe(false);
	});
});

describe('getMyVerdict', () => {
	it('returns null when nothing was submitted', () => {
		expect(getMyVerdict(db, 1, 1)).toBeNull();
	});

	it('returns the ratings and verdict for prefilling a revisit', () => {
		claimNext(db, 1, 1, ['Finance']);
		submitVerdict(db, 1, 1, {
			overall: 'meh',
			ratings: [{ questionId: ratedIds[0], value: 'skip' }],
			note: 'borderline'
		});

		const mine = getMyVerdict(db, 1, 1)!;
		expect(mine.overall).toBe('meh');
		expect(mine.note).toBe('borderline');
		expect(mine.ratings[ratedIds[0]]).toBe('skip');
		expect(mine.redFlag).toBe(false);
	});
});
