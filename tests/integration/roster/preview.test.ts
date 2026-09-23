import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '../../helpers/db';
import { seedApplicant } from '../../helpers/applicants';
import { cycles, members } from '../../../src/lib/server/db/schema';
import { parseCsv } from '../../../src/lib/server/import/parse';
import { previewRoster } from '../../../src/lib/server/roster/validate';
import type { AppDb } from '../../../src/lib/server/db';

const MENTEES = readFileSync('tests/fixtures/roster-mentees.csv', 'utf8');

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

describe('previewRoster — mentees', () => {
	it('resolves every row and reports industry from the file', () => {
		const report = previewRoster(db, 1, 'mentee', parseCsv(MENTEES));
		expect(report.blocking).toEqual([]);
		expect(report.industryCounts).toEqual({ Finance: 1, Tech: 1 });
	});

	it('reports an industry mismatch as information, not a blocker', () => {
		const report = previewRoster(db, 1, 'mentee', parseCsv(MENTEES));
		expect(report.industryMismatches).toEqual([
			{ studentId: '01000002', registered: 'Finance', confirmed: 'Tech' }
		]);
		expect(report.blocking).toEqual([]);
	});

	it('reports a row with no matching applicant as a mentee to create, without blocking', () => {
		const csv =
			'student_id,industry,full_name,email\n01000001,Finance,Ada Fictional,ada@example.com\n99999999,Finance,New Mentee,new-mentee@example.com\n';
		const report = previewRoster(db, 1, 'mentee', parseCsv(csv));
		expect(report.newMentees).toEqual([
			{
				studentId: '99999999',
				fullName: 'New Mentee',
				email: 'new-mentee@example.com',
				industry: 'Finance'
			}
		]);
		expect(report.industryCounts).toEqual({ Finance: 2 });
		expect(report.blocking).toEqual([]);
	});

	it('blocks when the student id already belongs to a different member of the cycle', () => {
		// A mentor was imported with a student id that also belongs to a mentee
		// applicant — the row resolves, and the ownership clash is reported.
		seedApplicant(db, {
			cycleId: 1,
			publicRef: 3,
			industry1: 'Finance',
			fullName: 'New Applicant',
			email: 'new@example.com',
			studentId: '02000001'
		});
		db.insert(members)
			.values({
				cycleId: 1,
				role: 'mentor',
				fullName: 'Mentor A',
				email: 'ma@example.com',
				studentId: '02000001'
			})
			.run();
		const csv =
			'student_id,industry,full_name,email\n02000001,Finance,New Applicant,new@example.com\n';
		const report = previewRoster(db, 1, 'mentee', parseCsv(csv));
		expect(report.studentIdConflicts).toEqual([{ studentId: '02000001', memberName: 'Mentor A' }]);
		expect(report.blocking).toContain(
			'Student ID 02000001 already belongs to Mentor A in this cycle.'
		);
	});

	it('does not flag a re-import of the same person as a conflict', () => {
		db.insert(members)
			.values({
				cycleId: 1,
				role: 'mentee',
				fullName: 'Ada Fictional',
				email: 'ada@example.com',
				studentId: '01000001',
				applicantId: 1
			})
			.run();
		const report = previewRoster(db, 1, 'mentee', parseCsv(MENTEES));
		expect(report.studentIdConflicts).toEqual([]);
	});

	it('blocks when a mentee resolves to an email a mentor already holds', () => {
		db.insert(members)
			.values({
				cycleId: 1,
				role: 'mentor',
				fullName: 'Mentor A',
				email: 'ada@example.com',
				studentId: '02000001'
			})
			.run();
		const csv =
			'student_id,industry,full_name,email\n01000001,Finance,Ada Fictional,ada@example.com\n';
		const report = previewRoster(db, 1, 'mentee', parseCsv(csv));
		expect(report.emailConflicts).toEqual([{ email: 'ada@example.com', memberName: 'Mentor A' }]);
		expect(report.blocking).toContain(
			'Email ada@example.com already belongs to Mentor A in this cycle.'
		);
	});

	it('blocks when two rows resolve to the same email under different student ids', () => {
		seedApplicant(db, {
			cycleId: 1,
			publicRef: 3,
			industry1: 'Finance',
			fullName: 'Cy Fictional',
			email: 'ada@example.com',
			studentId: '01000003'
		});
		const csv =
			'student_id,industry,full_name,email\n01000003,Finance,Cy Fictional,cy@example.com\n01000001,Finance,Ada Fictional,ada@example.com\n';
		const report = previewRoster(db, 1, 'mentee', parseCsv(csv));
		expect(report.blocking).toContain(
			'Student IDs 01000001 and 01000003 both resolve to email ada@example.com — one row is a duplicate.'
		);
	});

	it('blocks when a mentee member already holds the email under a different student id', () => {
		db.insert(members)
			.values({
				cycleId: 1,
				role: 'mentee',
				fullName: 'Other Mentee',
				email: 'ada@example.com',
				studentId: '01000005'
			})
			.run();
		const csv =
			'student_id,industry,full_name,email\n01000001,Finance,Ada Fictional,ada@example.com\n';
		const report = previewRoster(db, 1, 'mentee', parseCsv(csv));
		expect(report.blocking).toContain(
			'Email ada@example.com already belongs to a mentee with student ID 01000005 in this cycle.'
		);
	});

	it('blocks when a new mentee email collides with a matched row email', () => {
		const csv =
			'student_id,industry,full_name,email\n01000001,Finance,Ada Fictional,ada.csv@example.com\n99999999,Tech,New Mentee,ada@example.com\n';
		const report = previewRoster(db, 1, 'mentee', parseCsv(csv));
		expect(report.blocking).toContain(
			'Student IDs 01000001 and 99999999 both resolve to email ada@example.com — one row is a duplicate.'
		);
	});

	it('blocks when a new mentee email is already held by a member of the other role', () => {
		db.insert(members)
			.values({
				cycleId: 1,
				role: 'mentor',
				fullName: 'Mentor A',
				email: 'new-mentee@example.com',
				studentId: '02000001'
			})
			.run();
		const csv =
			'student_id,industry,full_name,email\n99999999,Finance,New Mentee,new-mentee@example.com\n';
		const report = previewRoster(db, 1, 'mentee', parseCsv(csv));
		expect(report.emailConflicts).toEqual([
			{ email: 'new-mentee@example.com', memberName: 'Mentor A' }
		]);
		expect(report.blocking).toContain(
			'Email new-mentee@example.com already belongs to Mentor A in this cycle.'
		);
	});

	it('blocks when a new mentee student id is already held by a different member', () => {
		db.insert(members)
			.values({
				cycleId: 1,
				role: 'mentor',
				fullName: 'Mentor A',
				email: 'ma@example.com',
				studentId: '99999999'
			})
			.run();
		const csv =
			'student_id,industry,full_name,email\n99999999,Finance,New Mentee,new-mentee@example.com\n';
		const report = previewRoster(db, 1, 'mentee', parseCsv(csv));
		expect(report.studentIdConflicts).toEqual([{ studentId: '99999999', memberName: 'Mentor A' }]);
		expect(report.blocking).toContain(
			'Student ID 99999999 already belongs to Mentor A in this cycle.'
		);
	});
});

describe('previewRoster — mentors', () => {
	it('passes a clean mentor file', () => {
		const csv = 'full_name,email,industry,student_id\nMentor A,ma@example.com,Finance,02000001\n';
		const report = previewRoster(db, 1, 'mentor', parseCsv(csv));
		expect(report.blocking).toEqual([]);
		expect(report.industryCounts).toEqual({ Finance: 1 });
	});

	it('blocks on a non-canonical industry', () => {
		const csv =
			'full_name,email,industry,student_id\nMentor A,ma@example.com,Rocket Science,02000001\n';
		const report = previewRoster(db, 1, 'mentor', parseCsv(csv));
		expect(report.blocking.length).toBeGreaterThan(0);
	});
});
