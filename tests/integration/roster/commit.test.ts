import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../../helpers/db';
import { seedApplicant } from '../../helpers/applicants';
import { cycles, members } from '../../../src/lib/server/db/schema';
import { parseCsv } from '../../../src/lib/server/import/parse';
import { commitRoster } from '../../../src/lib/server/roster/commit';
import type { AppDb } from '../../../src/lib/server/db';

const MENTEES = readFileSync('tests/fixtures/roster-mentees.csv', 'utf8');
const MENTORS = readFileSync('tests/fixtures/roster-mentors.csv', 'utf8');

let db: AppDb;

beforeEach(() => {
	db = makeTestDb();
	db.insert(cycles).values({ name: '10th Circle', year: 2026 }).run();
	seedApplicant(db, {
		cycleId: 1,
		publicRef: 1,
		industry1: 'Finance',
		fullName: 'Ada Fictional',
		email: 'ada@example.com',
		studentId: '01000001'
	});
	seedApplicant(db, {
		cycleId: 1,
		publicRef: 2,
		industry1: 'Finance',
		fullName: 'Bo Fictional',
		email: 'bo@example.com',
		studentId: '01000002'
	});
});

describe('commitRoster — mentees', () => {
	it('promotes every resolved row with the confirmed industry', () => {
		const result = commitRoster(db, 1, 'mentee', parseCsv(MENTEES));
		expect(result).toEqual({ inserted: 2, updated: 0 });

		const rows = db.select().from(members).where(eq(members.role, 'mentee')).all();
		expect(rows).toHaveLength(2);

		const bo = rows.find((r) => r.studentId === '01000002')!;
		expect(bo).toMatchObject({
			fullName: 'Bo Fictional',
			email: 'bo@example.com',
			industry: 'Tech', // confirmed by the roster, not the registered Finance
			applicantId: 2
		});
	});

	it('updates on re-import rather than duplicating', () => {
		commitRoster(db, 1, 'mentee', parseCsv(MENTEES));
		const result = commitRoster(db, 1, 'mentee', parseCsv(MENTEES));
		expect(result).toEqual({ inserted: 0, updated: 2 });
		expect(db.select().from(members).all()).toHaveLength(2);
	});

	it('commits nothing when a row stops resolving', () => {
		const csv = 'student_id,industry\n01000001,Finance\n99999999,Finance\n';
		expect(() => commitRoster(db, 1, 'mentee', parseCsv(csv))).toThrow();
		expect(db.select().from(members).all()).toHaveLength(0);
	});

	it('throws and writes nothing when two rows resolve to one email', () => {
		seedApplicant(db, {
			cycleId: 1,
			publicRef: 3,
			industry1: 'Finance',
			fullName: 'Cy Fictional',
			email: 'ada@example.com',
			studentId: '01000003'
		});
		const csv = 'student_id,industry\n01000003,Finance\n01000001,Finance\n';
		expect(() => commitRoster(db, 1, 'mentee', parseCsv(csv))).toThrow(
			'Student IDs 01000001 and 01000003 both resolve to email ada@example.com — one row is a duplicate.'
		);
		expect(db.select().from(members).all()).toHaveLength(0);
	});
});

describe('commitRoster — mentors', () => {
	it('imports mentors with identity from the file and no application', () => {
		const result = commitRoster(db, 1, 'mentor', parseCsv(MENTORS));
		expect(result).toEqual({ inserted: 2, updated: 0 });

		const rows = db.select().from(members).where(eq(members.role, 'mentor')).all();
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({
			fullName: 'Mentor Alpha',
			email: 'mentor-alpha@example.com',
			industry: 'Finance',
			studentId: '02000001',
			applicantId: null
		});
	});

	it('rejects a mentor whose email a mentee already holds', () => {
		commitRoster(db, 1, 'mentee', parseCsv(MENTEES));
		const csv = 'full_name,email,industry,student_id\nMentor A,ada@example.com,Finance,02000001\n';
		expect(() => commitRoster(db, 1, 'mentor', parseCsv(csv))).toThrow(
			/already belongs to a mentee in this cycle/
		);
	});
});
