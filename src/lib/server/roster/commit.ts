import { and, eq } from 'drizzle-orm';
import type { AppDb } from '../db';
import { applicantPii, applicants } from '../db/schema';
import { normalizeIndustry } from '../import/normalize';
import type { ParsedCsv } from '../import/parse';
import { promoteApplicant, upsertMember, type MemberRole } from './members';

export type RosterCommitResult = { inserted: number; updated: number };

/**
 * Write a validated roster into `members`. Callers validate first via
 * previewRoster; resolution happens again inside the transaction so a race can
 * never leave a partial roster behind. A matched mentee row promotes its
 * applicant; a row with no applicant creates a member from the CSV, and two
 * rows ending up on one email still throw and roll the import back.
 */
export function commitRoster(
	db: AppDb,
	cycleId: number,
	role: MemberRole,
	parsed: ParsedCsv
): RosterCommitResult {
	let inserted = 0;
	let updated = 0;

	db.transaction((tx) => {
		if (role === 'mentee') {
			// Resolve every row before writing anything: two rows that end up on
			// one member email would silently merge into one member, so block
			// before the first upsert. Matched rows claim their applicant's
			// email; unmatched rows claim their CSV email.
			const claimedEmails = new Map<string, string>();
			const claimEmail = (email: string, studentId: string) => {
				if (!email) return;
				const seenStudentId = claimedEmails.get(email);
				if (seenStudentId !== undefined && seenStudentId !== studentId) {
					const [first, second] = [seenStudentId, studentId].sort();
					throw new Error(
						`Student IDs ${first} and ${second} both resolve to email ${email} — one row is a duplicate.`
					);
				}
				if (seenStudentId === undefined) claimedEmails.set(email, studentId);
			};

			for (const row of parsed.rows) {
				const studentId = (row['student_id'] ?? '').trim();
				const applicant = tx
					.select({ email: applicantPii.email })
					.from(applicants)
					.innerJoin(applicantPii, eq(applicantPii.applicantId, applicants.id))
					.where(and(eq(applicants.cycleId, cycleId), eq(applicantPii.studentId, studentId)))
					.get();

				claimEmail(applicant?.email ?? (row['email'] ?? '').trim(), studentId);
			}
		}

		for (const row of parsed.rows) {
			if (role === 'mentee') {
				const studentId = (row['student_id'] ?? '').trim();
				const applicant = tx
					.select({ id: applicants.id })
					.from(applicants)
					.innerJoin(applicantPii, eq(applicantPii.applicantId, applicants.id))
					.where(and(eq(applicants.cycleId, cycleId), eq(applicantPii.studentId, studentId)))
					.get();

				const industry = normalizeIndustry(row['industry'] ?? '');
				if (!industry) {
					throw new Error(`Student ID ${studentId} has no canonical industry.`);
				}

				if (!applicant) {
					// No application for this cycle: the member row is written from
					// the CSV alone, the same write path mentor rows use.
					const result = upsertMember(tx, cycleId, {
						role,
						fullName: (row['full_name'] ?? '').trim(),
						email: (row['email'] ?? '').trim(),
						industry,
						studentId,
						applicantId: null
					});
					if (result.inserted) inserted += 1;
					else updated += 1;
					continue;
				}

				const result = promoteApplicant(tx, cycleId, applicant.id, role, industry);
				if (result.inserted) inserted += 1;
				else updated += 1;
			} else {
				const industry = normalizeIndustry(row['industry'] ?? '');
				if (!industry) {
					throw new Error(`Row with email ${row['email']} has no canonical industry.`);
				}

				const result = upsertMember(tx, cycleId, {
					role,
					fullName: (row['full_name'] ?? '').trim(),
					email: (row['email'] ?? '').trim(),
					industry,
					studentId: (row['student_id'] ?? '').trim(),
					applicantId: null
				});
				if (result.inserted) inserted += 1;
				else updated += 1;
			}
		}
	});

	return { inserted, updated };
}
