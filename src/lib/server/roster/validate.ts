import { and, eq } from 'drizzle-orm';
import type { AppDb } from '../db';
import { applicantPii, applicants, members } from '../db/schema';
import { normalizeHeader } from '../import/columns';
import { normalizeIndustry } from '../import/normalize';
import type { ParsedCsv } from '../import/parse';
import { normalizeTelegram } from './contact';
import type { MemberRole } from './members';

const REQUIRED_COLUMNS: Record<MemberRole, string[]> = {
	mentee: ['student_id', 'industry', 'full_name', 'email'],
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
	invalidTelegrams: number;
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
	let invalidTelegrams = 0;

	for (const row of parsed.rows) {
		for (const field of required) {
			if ((row[field] ?? '').trim() === '') blank[field] = (blank[field] ?? 0) + 1;
		}

		const rawTelegram = row['telegram'] ?? '';
		if (rawTelegram.trim() !== '' && normalizeTelegram(rawTelegram) === null) {
			invalidTelegrams += 1;
		}

		const rawIndustry = row['industry'] ?? '';
		if (rawIndustry.trim() !== '' && normalizeIndustry(rawIndustry) === null) {
			unknownCounts.set(rawIndustry, (unknownCounts.get(rawIndustry) ?? 0) + 1);
		}

		const studentId = (row['student_id'] ?? '').trim();
		if (studentId !== '') studentIdCounts.set(studentId, (studentIdCounts.get(studentId) ?? 0) + 1);

		const email = (row['email'] ?? '').trim();
		if (email !== '') emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);
	}

	const blankRequiredCells = Object.entries(blank).map(([column, count]) => ({ column, count }));
	const unknownIndustries = [...unknownCounts.entries()].map(([value, count]) => ({
		value,
		count
	}));
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
		invalidTelegrams,
		blocking
	};
}

export type RosterReport = RosterFileReport & {
	role: MemberRole;
	industryCounts: Record<string, number>;
	/** Mentee rows whose student id matches no applicant in the cycle. These
	 * create a new member from the CSV, like mentor rows. Non-blocking. */
	newMentees: { studentId: string; fullName: string; email: string; industry: string }[];
	/** Confirmed industry differs from the registered first choice. Informational. */
	industryMismatches: { studentId: string; registered: string; confirmed: string }[];
	/** Student id already held by a different member of the cycle. Blocking. */
	studentIdConflicts: { studentId: string; memberName: string }[];
	/** Email already held by a member of the other role. Blocking. */
	emailConflicts: { email: string; memberName: string }[];
};

/**
 * The full picture the wizard shows before staging: file-level problems plus
 * what only the database knows. Resolution never reaches across cycles.
 */
export function previewRoster(
	db: AppDb,
	cycleId: number,
	role: MemberRole,
	parsed: ParsedCsv
): RosterReport {
	const file = validateRosterFile(role, parsed);

	const industryCounts: Record<string, number> = {};
	const newMentees: RosterReport['newMentees'] = [];
	const industryMismatches: RosterReport['industryMismatches'] = [];
	const studentIdConflicts: RosterReport['studentIdConflicts'] = [];
	const emailConflicts: RosterReport['emailConflicts'] = [];
	/** Email -> student id of the first row that claims it. */
	const resolvedEmails = new Map<string, string>();
	const identityClashes: string[] = [];

	const existing = db
		.select({
			role: members.role,
			fullName: members.fullName,
			email: members.email,
			studentId: members.studentId
		})
		.from(members)
		.where(eq(members.cycleId, cycleId))
		.all();

	const emailOwners = new Map(existing.map((m) => [m.email, m]));
	const studentOwners = new Map(
		existing.filter((m) => m.studentId !== null).map((m) => [m.studentId as string, m])
	);

	for (const row of parsed.rows) {
		const studentId = (row['student_id'] ?? '').trim();
		if (studentId === '') continue;

		const industry = normalizeIndustry(row['industry'] ?? '');
		if (industry) industryCounts[industry] = (industryCounts[industry] ?? 0) + 1;

		let email: string | null;

		if (role === 'mentee') {
			const applicant = db
				.select({
					email: applicantPii.email,
					industry1: applicants.industry1
				})
				.from(applicants)
				.innerJoin(applicantPii, eq(applicantPii.applicantId, applicants.id))
				.where(and(eq(applicants.cycleId, cycleId), eq(applicantPii.studentId, studentId)))
				.get();

			if (!applicant) {
				// No application for this cycle: the member will be created from
				// the CSV, the same way a mentor row would be.
				if (industry) {
					newMentees.push({
						studentId,
						fullName: (row['full_name'] ?? '').trim(),
						email: (row['email'] ?? '').trim(),
						industry
					});
				}
				email = (row['email'] ?? '').trim();
			} else {
				email = applicant.email;
				if (industry && industry !== applicant.industry1) {
					industryMismatches.push({
						studentId,
						registered: applicant.industry1,
						confirmed: industry
					});
				}
			}

			// Two rows ending up on one email would silently merge into one
			// member at commit, so track every claim — resolved or from the CSV.
			if (email) {
				const seenStudentId = resolvedEmails.get(email);
				if (seenStudentId !== undefined && seenStudentId !== studentId) {
					const [first, second] = [seenStudentId, studentId].sort();
					identityClashes.push(
						`Student IDs ${first} and ${second} both resolve to email ${email} — one row is a duplicate.`
					);
				} else if (seenStudentId === undefined) {
					resolvedEmails.set(email, studentId);
				}
			}
		} else {
			email = (row['email'] ?? '').trim();
		}

		const studentOwner = studentOwners.get(studentId);
		if (studentOwner && studentOwner.email !== email) {
			studentIdConflicts.push({ studentId, memberName: studentOwner.fullName });
		}

		if (email) {
			const emailOwner = emailOwners.get(email);
			// Same role + same email + same student id is a re-import update; the
			// other role is a collision, and the same role under a different
			// student id is an identity clash.
			if (emailOwner && emailOwner.role !== role) {
				emailConflicts.push({ email, memberName: emailOwner.fullName });
			} else if (
				emailOwner &&
				role === 'mentee' &&
				emailOwner.studentId !== null &&
				emailOwner.studentId !== studentId
			) {
				identityClashes.push(
					`Email ${email} already belongs to a mentee with student ID ${emailOwner.studentId} in this cycle.`
				);
			}
		}
	}

	const blocking = [...file.blocking];
	for (const { studentId, memberName } of studentIdConflicts) {
		blocking.push(`Student ID ${studentId} already belongs to ${memberName} in this cycle.`);
	}
	for (const { email, memberName } of emailConflicts) {
		blocking.push(`Email ${email} already belongs to ${memberName} in this cycle.`);
	}
	for (const message of identityClashes) {
		blocking.push(message);
	}

	return {
		...file,
		role,
		industryCounts,
		newMentees,
		industryMismatches,
		studentIdConflicts,
		emailConflicts,
		blocking
	};
}
