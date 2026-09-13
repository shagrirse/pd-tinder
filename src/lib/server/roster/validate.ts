import { normalizeHeader } from '../import/columns';
import { normalizeIndustry } from '../import/normalize';
import type { ParsedCsv } from '../import/parse';
import type { MemberRole } from './members';

const REQUIRED_COLUMNS: Record<MemberRole, string[]> = {
	mentee: ['student_id', 'industry'],
	mentor: ['full_name', 'email', 'industry', 'student_id']
};

export type RosterFileReport = {
	rowCount: number;
	missingColumns: string[];
	unmappedHeaders: string[];
	blankRequiredCells: { column: string; count: number }[];
	unknownIndustries: { value: string; count: number }[];
	duplicateStudentIds: { studentId: string; count: number }[];
	duplicateEmails: { email: string; count: number }[];
	blocking: string[];
};

/**
 * Everything wrong with a roster file that can be seen from the file alone.
 * `previewRoster` extends this with what only the database knows.
 */
export function validateRosterFile(role: MemberRole, parsed: ParsedCsv): RosterFileReport {
	const required = REQUIRED_COLUMNS[role];
	const present = new Set(parsed.headers.map(normalizeHeader));

	const missingColumns = required.filter((f) => !present.has(f));
	const unmappedHeaders = parsed.headers.filter((h) => !required.includes(normalizeHeader(h)));

	const blank: Record<string, number> = {};
	const unknownCounts = new Map<string, number>();
	const studentIdCounts = new Map<string, number>();
	const emailCounts = new Map<string, number>();

	for (const row of parsed.rows) {
		for (const field of required) {
			if ((row[field] ?? '').trim() === '') blank[field] = (blank[field] ?? 0) + 1;
		}

		const rawIndustry = row['industry'] ?? '';
		if (rawIndustry.trim() !== '' && normalizeIndustry(rawIndustry) === null) {
			unknownCounts.set(rawIndustry, (unknownCounts.get(rawIndustry) ?? 0) + 1);
		}

		const studentId = (row['student_id'] ?? '').trim();
		if (studentId !== '') studentIdCounts.set(studentId, (studentIdCounts.get(studentId) ?? 0) + 1);

		if (role === 'mentor') {
			const email = (row['email'] ?? '').trim();
			if (email !== '') emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);
		}
	}

	const blankRequiredCells = Object.entries(blank).map(([column, count]) => ({ column, count }));
	const unknownIndustries = [...unknownCounts.entries()].map(([value, count]) => ({ value, count }));
	const duplicateStudentIds = [...studentIdCounts.entries()]
		.filter(([, count]) => count > 1)
		.map(([studentId, count]) => ({ studentId, count }));
	const duplicateEmails = [...emailCounts.entries()]
		.filter(([, count]) => count > 1)
		.map(([email, count]) => ({ email, count }));

	const blocking: string[] = [];
	for (const field of missingColumns) {
		blocking.push(`No column is mapped to the required field "${field}".`);
	}
	for (const { column, count } of blankRequiredCells) {
		blocking.push(`${count} row(s) have a blank "${column}".`);
	}
	for (const { value, count } of unknownIndustries) {
		blocking.push(`Unrecognised industry "${value}" in ${count} row(s).`);
	}
	for (const { studentId, count } of duplicateStudentIds) {
		blocking.push(`Student ID ${studentId} appears ${count} times in the file.`);
	}
	for (const { email, count } of duplicateEmails) {
		blocking.push(`Email ${email} appears ${count} times in the file.`);
	}

	return {
		rowCount: parsed.rows.length,
		missingColumns,
		unmappedHeaders,
		blankRequiredCells,
		unknownIndustries,
		duplicateStudentIds,
		duplicateEmails,
		blocking
	};
}
