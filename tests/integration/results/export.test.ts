import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'csv-parse/sync';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../../helpers/db';
import { cycles, questions, users } from '../../../src/lib/server/db/schema';
import { DEFAULT_COLUMN_MAPPING } from '../../../src/lib/server/import/columns';
import { parseCsv } from '../../../src/lib/server/import/parse';
import { commitImport } from '../../../src/lib/server/import/commit';
import { claimNext } from '../../../src/lib/server/review/claim';
import { submitVerdict } from '../../../src/lib/server/review/verdict';
import { exportCycleCsv } from '../../../src/lib/server/results/export';
import type { AppDb } from '../../../src/lib/server/db';

const parsed = parseCsv(readFileSync('tests/fixtures/applicants-sample.csv', 'utf8'));
let db: AppDb;
let ratedIds: number[];

function rowsOf(csv: string): Record<string, string>[] {
	return parse(csv, { columns: true, bom: true }) as Record<string, string>[];
}

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

describe('exportCycleCsv', () => {
	it('includes one row per applicant', () => {
		expect(rowsOf(exportCycleCsv(db, 1))).toHaveLength(2);
	});

	it('includes the PII an admin needs to contact applicants', () => {
		const row = rowsOf(exportCycleCsv(db, 1))[0];
		expect(row.full_name).toBe('Ada Fictional');
		expect(row.email).toBe('ada@example.com');
		expect(row.student_id).toBe('01000001');
		expect(row.contact_number).toBe('91230001');
		expect(row.telegram).toBe('@adafictional');
	});

	it('includes normalised industry and LinkedIn status', () => {
		const rows = rowsOf(exportCycleCsv(db, 1));
		expect(rows[0].industry_1).toBe('Finance');
		expect(rows[1].industry_1).toBe('Finance');
		expect(rows[1].linkedin_status).toBe('missing');
	});

	it('includes score, coverage, verdict, and reviewer once reviewed', () => {
		claimNext(db, 1, 1, ['Finance']);
		submitVerdict(db, 1, 1, {
			overall: 'like',
			ratings: [{ questionId: ratedIds[0], value: 'like' }],
			note: 'strong'
		});

		const row = rowsOf(exportCycleCsv(db, 1)).find((r) => r.public_ref === '1')!;
		expect(row.score).toBe('1');
		expect(row.rated).toBe('1');
		expect(row.total).toBe('8');
		expect(row.overall).toBe('like');
		expect(row.reviewer).toBe('Reviewer One');
		expect(row.note).toBe('strong');
	});

	it('includes a per-question rating column and the answer text', () => {
		claimNext(db, 1, 1, ['Finance']);
		submitVerdict(db, 1, 1, {
			overall: 'like',
			ratings: [{ questionId: ratedIds[0], value: 'skip' }]
		});

		const row = rowsOf(exportCycleCsv(db, 1)).find((r) => r.public_ref === '1')!;
		expect(row['rating_q_why_tmc']).toBe('skip');
		expect(row['answer_q_why_tmc']).toBe('I want structured guidance.');
	});

	it('includes the red flag reason', () => {
		claimNext(db, 1, 1, ['Finance']);
		submitVerdict(db, 1, 1, {
			overall: null,
			ratings: [],
			redFlag: true,
			redFlagReason: 'Disclosed intent to misuse the network.'
		});

		const row = rowsOf(exportCycleCsv(db, 1)).find((r) => r.public_ref === '1')!;
		expect(row.red_flag).toBe('true');
		expect(row.red_flag_reason).toContain('misuse');
	});

	it('leaves review columns blank for unreviewed applicants', () => {
		const row = rowsOf(exportCycleCsv(db, 1))[0];
		expect(row.overall).toBe('');
		expect(row.score).toBe('');
		expect(row.reviewer).toBe('');
	});
});
