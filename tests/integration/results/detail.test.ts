import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../../helpers/db';
import { cycles, questions, ratings, users } from '../../../src/lib/server/db/schema';
import { DEFAULT_COLUMN_MAPPING } from '../../../src/lib/server/import/columns';
import { parseCsv } from '../../../src/lib/server/import/parse';
import { commitImport } from '../../../src/lib/server/import/commit';
import { claimNext } from '../../../src/lib/server/review/claim';
import { submitVerdict } from '../../../src/lib/server/review/verdict';
import { getApplicantDetail } from '../../../src/lib/server/results/detail';
import type { AppDb } from '../../../src/lib/server/db';

const parsed = parseCsv(readFileSync('tests/fixtures/applicants-sample.csv', 'utf8'));
let db: AppDb;
let ratedIds: number[];

beforeEach(() => {
	db = makeTestDb();
	db.insert(cycles).values({ name: 'C', year: 2026, status: 'reviewing' }).run();
	commitImport(db, 1, parsed, DEFAULT_COLUMN_MAPPING);
	db.insert(users).values({ name: 'Reviewer One', email: 'one@example.com' }).run();
	db.insert(users).values({ name: 'Reviewer Two', email: 'two@example.com' }).run();
	ratedIds = db
		.select({ id: questions.id })
		.from(questions)
		.where(eq(questions.isRated, true))
		.all()
		.map((q) => q.id);
});

describe('getApplicantDetail', () => {
	it('returns null for an unknown applicant', () => {
		expect(getApplicantDetail(db, 999)).toBeNull();
	});

	it('exposes the identity an admin needs to make contact', () => {
		const detail = getApplicantDetail(db, 1)!;
		expect(detail.fullName).toBe('Ada Fictional');
		expect(detail.email).toBe('ada@example.com');
		expect(detail.studentId).toBe('01000001');
		expect(detail.contactNumber).toBe('91230001');
		expect(detail.telegram).toBe('@adafictional');
		expect(detail.linkedinUrl).toBe('https://www.linkedin.com/in/ada-fictional');
	});

	it('exposes the normalised profile', () => {
		const detail = getApplicantDetail(db, 1)!;
		expect(detail.publicRef).toBe(1);
		expect(detail.industry1).toBe('Finance');
		expect(detail.industry2).toBe('Consulting');
		expect(detail.faculty).toBe('Lee Kong Chian School of Business');
		expect(detail.gender).toBe('Female');
		expect(detail.priorMentee).toBe(false);
		expect(detail.linkedinStatus).toBe('valid');
	});

	it('returns all nine answers in form order', () => {
		const detail = getApplicantDetail(db, 1)!;
		expect(detail.answers).toHaveLength(9);
		expect(detail.answers[0].key).toBe('q_why_tmc');
		expect(detail.answers.at(-1)!.key).toBe('q_key_events');
		expect(detail.answers[0].answerText).toBe('I want structured guidance.');
	});

	it('reports an unreviewed applicant with no verdict and no score', () => {
		const detail = getApplicantDetail(db, 1)!;
		expect(detail.overall).toBeNull();
		expect(detail.reviewerName).toBeNull();
		expect(detail.redFlag).toBe(false);
		expect(detail.score).toBeNull();
		expect(detail.rated).toBe(0);
		expect(detail.total).toBe(8);
		expect(detail.answers.every((a) => a.rating === null)).toBe(true);
	});

	it('attaches each rating to its own question', () => {
		claimNext(db, 1, 1, ['Finance']);
		submitVerdict(db, 1, 1, {
			overall: 'like',
			ratings: [
				{ questionId: ratedIds[0], value: 'like' },
				{ questionId: ratedIds[1], value: 'skip' }
			],
			note: 'promising'
		});

		const detail = getApplicantDetail(db, 1)!;
		const byId = new Map(detail.answers.map((a) => [a.questionId, a.rating]));
		expect(byId.get(ratedIds[0])).toBe('like');
		expect(byId.get(ratedIds[1])).toBe('skip');
		expect(byId.get(ratedIds[2])).toBeNull();
	});

	it('isolates ratings by reviewer to prevent cross-reviewer contamination', () => {
		claimNext(db, 1, 1, ['Finance']);
		submitVerdict(db, 1, 1, {
			overall: 'like',
			ratings: [
				{ questionId: ratedIds[0], value: 'like' }
			],
			note: 'good candidate'
		});

		// Insert a stray rating from reviewer 2 on a different question for the same applicant
		db.insert(ratings)
			.values({ userId: 2, applicantId: 1, questionId: ratedIds[1], value: 'skip' })
			.run();

		const detail = getApplicantDetail(db, 1)!;
		const byId = new Map(detail.answers.map((a) => [a.questionId, a.rating]));

		// Only reviewer 1's rating should appear
		expect(byId.get(ratedIds[0])).toBe('like');
		// Reviewer 2's stray rating should not appear
		expect(byId.get(ratedIds[1])).toBeNull();
		// Count should only include reviewer 1's rating
		expect(detail.rated).toBe(1);
		expect(detail.total).toBe(8);
	});

	it('reports the assessment for a reviewed applicant', () => {
		claimNext(db, 1, 1, ['Finance']);
		submitVerdict(db, 1, 1, {
			overall: 'like',
			ratings: [
				{ questionId: ratedIds[0], value: 'like' },
				{ questionId: ratedIds[1], value: 'skip' }
			],
			note: 'promising'
		});

		const detail = getApplicantDetail(db, 1)!;
		expect(detail.overall).toBe('like');
		expect(detail.note).toBe('promising');
		expect(detail.reviewerName).toBe('Reviewer One');
		expect(detail.score).toBe(0);
		expect(detail.rated).toBe(2);
		expect(detail.total).toBe(8);
	});

	it('reports a red flag with its reason', () => {
		claimNext(db, 1, 1, ['Finance']);
		submitVerdict(db, 1, 1, {
			overall: null,
			ratings: [],
			redFlag: true,
			redFlagReason: 'Disclosed intent to misuse the network.'
		});

		const detail = getApplicantDetail(db, 1)!;
		expect(detail.redFlag).toBe(true);
		expect(detail.redFlagReason).toContain('misuse');
		expect(detail.overall).toBeNull();
	});

	it('shows the marker for a missing LinkedIn profile', () => {
		const detail = getApplicantDetail(db, 2)!;
		expect(detail.linkedinStatus).toBe('missing');
	});
});
