import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '../../helpers/db';
import { cycles } from '../../../src/lib/server/db/schema';
import { DEFAULT_COLUMN_MAPPING } from '../../../src/lib/server/import/columns';
import { parseCsv } from '../../../src/lib/server/import/parse';
import { commitImport } from '../../../src/lib/server/import/commit';
import { PII_FIELD_NAMES, getBlindApplicant } from '../../../src/lib/server/review/blind';
import type { AppDb } from '../../../src/lib/server/db';

const parsed = parseCsv(readFileSync('tests/fixtures/applicants-sample.csv', 'utf8'));

/** Every distinctive PII value in the fixture. None may appear in a blind projection. */
const SECRETS = [
	'Ada Fictional',
	'ada@example.com',
	'ada@example.smu.edu.sg',
	'01000001',
	'91230001',
	'@adafictional',
	'https://www.linkedin.com/in/ada-fictional'
];

let db: AppDb;

beforeEach(() => {
	db = makeTestDb();
	db.insert(cycles).values({ name: 'Mentee Recruitment 2026', year: 2026 }).run();
	commitImport(db, 1, parsed, DEFAULT_COLUMN_MAPPING);
});

describe('getBlindApplicant', () => {
	it('leaks no PII value anywhere in the payload', () => {
		const serialised = JSON.stringify(getBlindApplicant(db, 1));
		for (const secret of SECRETS) expect(serialised).not.toContain(secret);
	});

	it('exposes no PII property name', () => {
		const applicant = getBlindApplicant(db, 1)!;
		for (const field of PII_FIELD_NAMES) expect(applicant).not.toHaveProperty(field);
	});

	it('exposes the context a reviewer needs', () => {
		const applicant = getBlindApplicant(db, 1)!;
		expect(applicant.publicRef).toBe(1);
		expect(applicant.industry1).toBe('Finance');
		expect(applicant.industry2).toBe('Consulting');
		expect(applicant.faculty).toBe('Lee Kong Chian School of Business');
		expect(applicant.gender).toBe('Female');
	});

	it('flags a missing LinkedIn without revealing the field', () => {
		expect(getBlindApplicant(db, 1)!.linkedinMissing).toBe(false);
		expect(getBlindApplicant(db, 2)!.linkedinMissing).toBe(true);
	});

	it('returns all nine answers in form order, eight of them rated', () => {
		const answers = getBlindApplicant(db, 1)!.answers;
		expect(answers).toHaveLength(9);
		expect(answers[0].key).toBe('q_why_tmc');
		expect(answers.at(-1)!.key).toBe('q_key_events');
		expect(answers.filter((a) => a.isRated)).toHaveLength(8);
	});

	it('returns null for an unknown applicant', () => {
		expect(getBlindApplicant(db, 999)).toBeNull();
	});
});
