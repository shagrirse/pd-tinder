import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '../../helpers/db';
import { cycles, users, verdicts } from '../../../src/lib/server/db/schema';
import { DEFAULT_COLUMN_MAPPING } from '../../../src/lib/server/import/columns';
import { parseCsv } from '../../../src/lib/server/import/parse';
import { commitImport } from '../../../src/lib/server/import/commit';
import {
	CLAIM_TTL_MS,
	claimNext,
	getActiveClaim,
	releaseClaim,
	releaseExpiredClaims
} from '../../../src/lib/server/review/claim';
import type { AppDb } from '../../../src/lib/server/db';

const parsed = parseCsv(readFileSync('tests/fixtures/applicants-sample.csv', 'utf8'));
let db: AppDb;

beforeEach(() => {
	db = makeTestDb();
	db.insert(cycles).values({ name: 'C', year: 2026 }).run();
	commitImport(db, 1, parsed, DEFAULT_COLUMN_MAPPING);
	db.insert(users).values([
		{ name: 'One', email: 'one@example.com' },
		{ name: 'Two', email: 'two@example.com' }
	]).run();
});

describe('claimNext', () => {
	it('claims the lowest-numbered unclaimed applicant in the pool', () => {
		expect(claimNext(db, 1, 1, ['Finance'])).toBe(1);
	});

	it('never hands the same applicant to two reviewers', () => {
		const first = claimNext(db, 1, 1, ['Finance']);
		const second = claimNext(db, 2, 1, ['Finance']);
		expect(second).not.toBe(first);
		expect(second).toBe(2);
	});

	it('resumes the caller existing claim instead of issuing a new one', () => {
		const first = claimNext(db, 1, 1, ['Finance']);
		expect(claimNext(db, 1, 1, ['Finance'])).toBe(first);
	});

	it('returns null when the pool is exhausted', () => {
		claimNext(db, 1, 1, ['Finance']);
		claimNext(db, 2, 1, ['Finance']);
		db.insert(users).values({ name: 'Three', email: 'three@example.com' }).run();
		expect(claimNext(db, 3, 1, ['Finance'])).toBeNull();
	});

	it('ignores industries the reviewer is not assigned to', () => {
		expect(claimNext(db, 1, 1, ['Tech'])).toBeNull();
	});

	it('skips applicants that already have a verdict', () => {
		const now = new Date();
		db.insert(verdicts)
			.values({ userId: 2, applicantId: 1, overall: 'like', submittedAt: now, updatedAt: now })
			.run();
		expect(claimNext(db, 1, 1, ['Finance'])).toBe(2);
	});

	it('re-offers an applicant whose claim expired', () => {
		const start = new Date('2026-08-25T00:00:00Z');
		claimNext(db, 1, 1, ['Finance'], start);
		const later = new Date(start.getTime() + CLAIM_TTL_MS + 1000);
		expect(claimNext(db, 2, 1, ['Finance'], later)).toBe(1);
	});
});

describe('claim lifecycle helpers', () => {
	it('reports the active claim and clears it on release', () => {
		const applicantId = claimNext(db, 1, 1, ['Finance'])!;
		expect(getActiveClaim(db, 1)).toBe(applicantId);
		releaseClaim(db, applicantId, 1);
		expect(getActiveClaim(db, 1)).toBeNull();
	});

	it('counts expired claims released', () => {
		const start = new Date('2026-08-25T00:00:00Z');
		claimNext(db, 1, 1, ['Finance'], start);
		const later = new Date(start.getTime() + CLAIM_TTL_MS + 1000);
		expect(releaseExpiredClaims(db, later)).toBe(1);
		expect(getActiveClaim(db, 1, later)).toBeNull();
	});
});
