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
 * never leave a partial roster behind — a row that stops resolving throws and
 * the whole import rolls back.
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
		for (const row of parsed.rows) {
			if (role === 'mentee') {
				const studentId = (row['student_id'] ?? '').trim();
				const applicant = tx
					.select({ id: applicants.id })
					.from(applicants)
					.innerJoin(applicantPii, eq(applicantPii.applicantId, applicants.id))
					.where(and(eq(applicants.cycleId, cycleId), eq(applicantPii.studentId, studentId)))
					.get();

				if (!applicant) {
					throw new Error(`Student ID ${studentId} does not match any applicant in this cycle.`);
				}

				const industry = normalizeIndustry(row['industry'] ?? '');
				if (!industry) {
					throw new Error(`Student ID ${studentId} has no canonical industry.`);
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
