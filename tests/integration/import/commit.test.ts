import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../../helpers/db';
import {
	applicantPii,
	applicants,
	cycles,
	questions,
	responses
} from '../../../src/lib/server/db/schema';
import { DEFAULT_COLUMN_MAPPING } from '../../../src/lib/server/import/columns';
import { parseCsv } from '../../../src/lib/server/import/parse';
import { commitImport } from '../../../src/lib/server/import/commit';
import type { AppDb } from '../../../src/lib/server/db';

const parsed = parseCsv(readFileSync('tests/fixtures/applicants-sample.csv', 'utf8'));

let db: AppDb;

beforeEach(() => {
	db = makeTestDb();
	db.insert(cycles).values({ name: 'Mentee Recruitment 2026', year: 2026 }).run();
});

describe('commitImport', () => {
	it('inserts every applicant', () => {
		const result = commitImport(db, 1, parsed, DEFAULT_COLUMN_MAPPING);
		expect(result).toEqual({ inserted: 2, updated: 0 });
		expect(db.select().from(applicants).all()).toHaveLength(2);
	});

	it('creates the nine questions once, marking eight as rated', () => {
		commitImport(db, 1, parsed, DEFAULT_COLUMN_MAPPING);
		const rows = db.select().from(questions).all();
		expect(rows).toHaveLength(9);
		expect(rows.filter((q) => q.isRated)).toHaveLength(8);
		expect(rows.find((q) => q.key === 'q_key_events')!.isRated).toBe(false);
	});

	it('normalises industries on the way in', () => {
		commitImport(db, 1, parsed, DEFAULT_COLUMN_MAPPING);
		const rows = db.select().from(applicants).all();
		expect(rows.map((r) => r.industry1)).toEqual(['Finance', 'Finance']);
		expect(rows[1].industry2).toBe('HR/Ops');
	});

	it('classifies LinkedIn status', () => {
		commitImport(db, 1, parsed, DEFAULT_COLUMN_MAPPING);
		const rows = db.select().from(applicants).all();
		expect(rows.map((r) => r.linkedinStatus)).toEqual(['valid', 'missing']);
	});

	it('assigns sequential public refs starting at 1', () => {
		commitImport(db, 1, parsed, DEFAULT_COLUMN_MAPPING);
		expect(db.select().from(applicants).all().map((r) => r.publicRef)).toEqual([1, 2]);
	});

	it('stores PII separately from the applicant row', () => {
		commitImport(db, 1, parsed, DEFAULT_COLUMN_MAPPING);
		const pii = db.select().from(applicantPii).where(eq(applicantPii.applicantId, 1)).get();
		expect(pii!.fullName).toBe('Ada Fictional');
		expect(pii!.studentId).toBe('01000001');
	});

	it('stores one response per question per applicant', () => {
		commitImport(db, 1, parsed, DEFAULT_COLUMN_MAPPING);
		expect(db.select().from(responses).all()).toHaveLength(18);
	});

	it('is idempotent — re-importing updates instead of duplicating', () => {
		commitImport(db, 1, parsed, DEFAULT_COLUMN_MAPPING);
		const result = commitImport(db, 1, parsed, DEFAULT_COLUMN_MAPPING);
		expect(result).toEqual({ inserted: 0, updated: 2 });
		expect(db.select().from(applicants).all()).toHaveLength(2);
		expect(db.select().from(responses).all()).toHaveLength(18);
	});

	it('keeps public refs stable across a re-import', () => {
		commitImport(db, 1, parsed, DEFAULT_COLUMN_MAPPING);
		const before = db.select().from(applicants).all().map((r) => r.publicRef);
		commitImport(db, 1, parsed, DEFAULT_COLUMN_MAPPING);
		expect(db.select().from(applicants).all().map((r) => r.publicRef)).toEqual(before);
	});

	it('applies corrected answers on re-import', () => {
		commitImport(db, 1, parsed, DEFAULT_COLUMN_MAPPING);
		const edited = {
			headers: parsed.headers,
			rows: [
				{ ...parsed.rows[0], 'why would you like to join tmc as a mentee?': 'A corrected answer.' },
				parsed.rows[1]
			]
		};
		commitImport(db, 1, edited, DEFAULT_COLUMN_MAPPING);
		const question = db.select().from(questions).where(eq(questions.key, 'q_why_tmc')).get();
		const answer = db
			.select()
			.from(responses)
			.where(eq(responses.questionId, question!.id))
			.all()
			.find((r) => r.applicantId === 1);
		expect(answer!.answerText).toBe('A corrected answer.');
	});
});
