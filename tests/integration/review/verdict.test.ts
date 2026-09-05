import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { makeTestDb } from '../../helpers/db';
import { claims, cycles, questions, ratings, users, verdicts } from '../../../src/lib/server/db/schema';
import { DEFAULT_COLUMN_MAPPING } from '../../../src/lib/server/import/columns';
import { parseCsv } from '../../../src/lib/server/import/parse';
import { commitImport } from '../../../src/lib/server/import/commit';
import { claimNext } from '../../../src/lib/server/review/claim';
import { VerdictError, submitVerdict } from '../../../src/lib/server/review/verdict';
import type { AppDb } from '../../../src/lib/server/db';

const parsed = parseCsv(readFileSync('tests/fixtures/applicants-sample.csv', 'utf8'));
let db: AppDb;
let ratedQuestionIds: number[];

beforeEach(() => {
	db = makeTestDb();
	db.insert(cycles).values({ name: 'C', year: 2026 }).run();
	commitImport(db, 1, parsed, DEFAULT_COLUMN_MAPPING);
	db.insert(users).values([
		{ name: 'One', email: 'one@example.com' },
		{ name: 'Two', email: 'two@example.com' }
	]).run();
	ratedQuestionIds = db
		.select({ id: questions.id })
		.from(questions)
		.where(eq(questions.isRated, true))
		.all()
		.map((q) => q.id);
});

describe('submitVerdict', () => {
	it('writes ratings and the verdict together', () => {
		claimNext(db, 1, 1, ['Finance']);
		submitVerdict(db, 1, 1, {
			overall: 'like',
			ratings: ratedQuestionIds.map((questionId) => ({ questionId, value: 'like' as const }))
		});

		expect(db.select().from(ratings).all()).toHaveLength(8);
		expect(db.select().from(verdicts).get()!.overall).toBe('like');
	});

	it('releases the claim so the reviewer moves on', () => {
		claimNext(db, 1, 1, ['Finance']);
		submitVerdict(db, 1, 1, { overall: 'meh', ratings: [] });
		expect(db.select().from(claims).all()).toHaveLength(0);
	});

	it('accepts a partial set of ratings', () => {
		claimNext(db, 1, 1, ['Finance']);
		submitVerdict(db, 1, 1, {
			overall: 'meh',
			ratings: [{ questionId: ratedQuestionIds[0], value: 'like' }]
		});
		expect(db.select().from(ratings).all()).toHaveLength(1);
	});

	it('stores a red flag with its reason and no overall verdict', () => {
		claimNext(db, 1, 1, ['Finance']);
		submitVerdict(db, 1, 1, {
			overall: null,
			ratings: [],
			redFlag: true,
			redFlagReason: 'Stated they intend to misuse the mentor network.'
		});

		const verdict = db.select().from(verdicts).get()!;
		expect(verdict.redFlag).toBe(true);
		expect(verdict.overall).toBeNull();
		expect(verdict.redFlagReason).toContain('misuse');
	});

	it('rejects a red flag without a substantive reason', () => {
		claimNext(db, 1, 1, ['Finance']);
		expect(() =>
			submitVerdict(db, 1, 1, { overall: null, ratings: [], redFlag: true, redFlagReason: 'bad' })
		).toThrow(VerdictError);
	});

	it('rejects a normal submission with no overall verdict', () => {
		claimNext(db, 1, 1, ['Finance']);
		expect(() => submitVerdict(db, 1, 1, { overall: null, ratings: [] })).toThrow(VerdictError);
	});

	it('rejects a rating on a question that is not rated', () => {
		claimNext(db, 1, 1, ['Finance']);
		const contextQuestion = db
			.select({ id: questions.id })
			.from(questions)
			.where(eq(questions.key, 'q_key_events'))
			.get()!;
		expect(() =>
			submitVerdict(db, 1, 1, {
				overall: 'like',
				ratings: [{ questionId: contextQuestion.id, value: 'like' }]
			})
		).toThrow(VerdictError);
	});

	it('rejects submitting for an applicant the caller does not hold', () => {
		claimNext(db, 1, 1, ['Finance']);
		expect(() => submitVerdict(db, 2, 1, { overall: 'like', ratings: [] })).toThrow(VerdictError);
	});

	it('allows the owner to revisit and replace their ratings', () => {
		claimNext(db, 1, 1, ['Finance']);
		const first = new Date('2026-08-25T00:00:00Z');
		submitVerdict(db, 1, 1, {
			overall: 'like',
			ratings: [{ questionId: ratedQuestionIds[0], value: 'like' }]
		}, first);

		const second = new Date('2026-08-26T00:00:00Z');
		submitVerdict(db, 1, 1, {
			overall: 'skip',
			ratings: [{ questionId: ratedQuestionIds[0], value: 'skip' }]
		}, second);

		expect(db.select().from(verdicts).all()).toHaveLength(1);
		const verdict = db.select().from(verdicts).get()!;
		expect(verdict.overall).toBe('skip');
		expect(verdict.submittedAt.getTime()).toBe(first.getTime());
		expect(verdict.updatedAt.getTime()).toBe(second.getTime());

		const rating = db
			.select()
			.from(ratings)
			.where(and(eq(ratings.userId, 1), eq(ratings.applicantId, 1)))
			.all();
		expect(rating).toHaveLength(1);
		expect(rating[0].value).toBe('skip');
	});
});
