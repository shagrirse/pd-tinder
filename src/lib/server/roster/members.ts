import { and, eq } from 'drizzle-orm';
import type { AppDb } from '../db';
import { applicantPii, applicants, members } from '../db/schema';

export type MemberRole = 'mentor' | 'mentee';

/**
 * What the write helpers accept: the plain connection or a transaction handle
 * of the same shape. commitRoster runs its outer transaction and passes the
 * handle down; the nested `transaction` calls here then become savepoints.
 */
type MemberDb = AppDb | Parameters<Parameters<AppDb['transaction']>[0]>[0];

export type MemberInput = {
	role: MemberRole;
	fullName: string;
	email: string;
	industry: string;
	studentId: string;
	applicantId: number | null;
};

/**
 * The single write path into `members`. Upserts on (cycle_id, email); a
 * matching row has full_name, industry, student_id and applicant_id updated.
 * `role` and `active` are never touched by an import: deactivation is an
 * explicit admin action, never a side effect of uploading a partial file.
 *
 * A matching email held by the other role is rejected, not overwritten —
 * spec §7: one email belongs to one member of a cycle, whichever role.
 */
export function upsertMember(
	db: MemberDb,
	cycleId: number,
	input: MemberInput
): { id: number; inserted: boolean } {
	return db.transaction((tx) => {
		const existing = tx
			.select({ id: members.id, role: members.role })
			.from(members)
			.where(and(eq(members.cycleId, cycleId), eq(members.email, input.email)))
			.get();

		if (existing) {
			if (existing.role !== input.role) {
				throw new Error(
					`Email ${input.email} already belongs to a ${existing.role} in this cycle.`
				);
			}

			tx.update(members)
				.set({
					fullName: input.fullName,
					industry: input.industry,
					studentId: input.studentId,
					applicantId: input.applicantId
				})
				.where(eq(members.id, existing.id))
				.run();
			return { id: existing.id, inserted: false };
		}

		const created = tx
			.insert(members)
			.values({ cycleId, ...input })
			.returning({ id: members.id })
			.get();

		return { id: created.id, inserted: true };
	});
}

/**
 * Promote an applicant into a member. Identity — name, email, student id — is
 * read from the application, which is the source of truth for who someone is.
 * Industry is passed in, not read: it is the outcome of the selection process,
 * which the application cannot know. The future selection UI calls exactly
 * this, supplying the industry it confirmed the applicant into.
 */
export function promoteApplicant(
	db: MemberDb,
	cycleId: number,
	applicantId: number,
	role: MemberRole,
	industry: string
): { id: number; inserted: boolean } {
	const applicant = db
		.select({
			fullName: applicantPii.fullName,
			email: applicantPii.email,
			studentId: applicantPii.studentId
		})
		.from(applicants)
		.innerJoin(applicantPii, eq(applicantPii.applicantId, applicants.id))
		.where(and(eq(applicants.id, applicantId), eq(applicants.cycleId, cycleId)))
		.get();

	if (!applicant) {
		throw new Error(`No applicant ${applicantId} in cycle ${cycleId}`);
	}

	return upsertMember(db, cycleId, {
		role,
		fullName: applicant.fullName,
		email: applicant.email,
		industry,
		studentId: applicant.studentId,
		applicantId
	});
}
