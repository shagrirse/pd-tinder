import { describe, expect, it } from 'vitest';
import { parseCsv } from '../../../src/lib/server/import/parse';
import { validateRosterFile } from '../../../src/lib/server/roster/validate';

function validate(role: 'mentor' | 'mentee', csv: string) {
	return validateRosterFile(role, parseCsv(csv));
}

describe('validateRosterFile — mentees', () => {
	it('accepts a clean file with a legibility column alongside', () => {
		const report = validate(
			'mentee',
			'student_id,industry,full_name,email,note\n01000001,Finance,Ada Fictional,ada@example.com,hi\n'
		);
		expect(report.blocking).toEqual([]);
		expect(report.rowCount).toBe(1);
		// The legibility column is not part of the roster format; reported, ignored.
		expect(report.unmappedHeaders).toEqual(['note']);
	});

	it('blocks on a missing required column', () => {
		const report = validate('mentee', 'student_id,industry\n01000001,Finance\n');
		expect(report.missingColumns).toEqual(['full_name', 'email']);
		expect(report.blocking).toContain('No column is mapped to the required field "full_name".');
	});

	it('blocks on blank required cells', () => {
		const report = validate(
			'mentee',
			'student_id,industry,full_name,email\n,Finance,Ada Fictional,ada@example.com\n01000001,,Bo Fictional,bo@example.com\n'
		);
		expect(report.blankRequiredCells).toEqual([
			{ column: 'student_id', count: 1 },
			{ column: 'industry', count: 1 }
		]);
		expect(report.blocking).toContain('1 row(s) have a blank "student_id".');
	});

	it('blocks on a non-canonical industry', () => {
		const report = validate(
			'mentee',
			'student_id,industry,full_name,email\n01000001,Rocket Science,Ada Fictional,ada@example.com\n'
		);
		expect(report.unknownIndustries).toEqual([{ value: 'Rocket Science', count: 1 }]);
		expect(report.blocking).toContain('Unrecognised industry "Rocket Science" in 1 row(s).');
	});

	it('accepts an industry that needs normalisation', () => {
		const report = validate(
			'mentee',
			'student_id,industry,full_name,email\n01000001,human resource / ops,Ada Fictional,ada@example.com\n'
		);
		expect(report.blocking).toEqual([]);
	});

	it('blocks on a student id repeated within the file', () => {
		const report = validate(
			'mentee',
			'student_id,industry,full_name,email\n01000001,Finance,Ada Fictional,ada@example.com\n01000001,Tech,Ada Again,ada.again@example.com\n'
		);
		expect(report.duplicateStudentIds).toEqual([{ studentId: '01000001', count: 2 }]);
		expect(report.blocking).toContain('Student ID 01000001 appears 2 times in the file.');
	});

	it('blocks on an email repeated within the file', () => {
		const report = validate(
			'mentee',
			'student_id,industry,full_name,email\n01000001,Finance,Ada Fictional,shared@example.com\n01000002,Tech,Bo Fictional,shared@example.com\n'
		);
		expect(report.duplicateEmails).toEqual([{ email: 'shared@example.com', count: 2 }]);
		expect(report.blocking).toContain('Email shared@example.com appears 2 times in the file.');
	});

	it('reports telegram values that cannot be normalised, without blocking', () => {
		const report = validate(
			'mentee',
			'student_id,industry,full_name,email,telegram\n01000001,Finance,Ada Fictional,ada@example.com,bad handle!\n'
		);
		expect(report.blocking).toEqual([]);
		expect(report.invalidTelegrams).toBe(1);
	});
});

describe('validateRosterFile — mentors', () => {
	const CLEAN = 'full_name,email,industry,student_id\nMentor A,ma@example.com,Finance,02000001\n';

	it('accepts a clean file', () => {
		expect(validate('mentor', CLEAN).blocking).toEqual([]);
	});

	it('blocks on all four required columns being mandatory', () => {
		const report = validate('mentor', 'full_name,email\nMentor A,ma@example.com\n');
		expect(report.missingColumns).toEqual(['industry', 'student_id']);
	});

	it('blocks on a repeated email within the file', () => {
		const report = validate(
			'mentor',
			'full_name,email,industry,student_id\nMentor A,ma@example.com,Finance,02000001\nMentor B,ma@example.com,Tech,02000002\n'
		);
		expect(report.duplicateEmails).toEqual([{ email: 'ma@example.com', count: 2 }]);
		expect(report.blocking).toContain('Email ma@example.com appears 2 times in the file.');
	});
});
