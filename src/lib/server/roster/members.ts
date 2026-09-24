import { and, eq } from 'drizzle-orm';
import type { AppDb } from '../db';
import { applicantPii, applicants, members } from '../db/schema';
import { normalizeLinkedin, normalizeTelegram } from './contact';

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
	/** Null means "not provided": inserts null, and updates keep the existing
	 * value. Imports pass null for blank cells so a partial re-import never
	 * wipes contact details; only `updateMemberContact` clears. */
	telegram?: string | null;
	linkedin?: string | null;
};

/**
 * The import write path into `members`. Upserts on (cycle_id, email); a
 * matching row has full_name, industry, student_id and applicant_id updated.
 * `role` and `active` are never touched by an import: deactivation is an
 * explicit admin action, never a side effect of uploading a partial file.
 * `updateMemberContact` is the other, edit-form path.
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

		const telegram = input.telegram ?? null;
		const linkedin = input.linkedin ?? null;

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
					applicantId: input.applicantId,
					...(telegram !== null ? { telegram } : {}),
					...(linkedin !== null ? { linkedin } : {})
				})
				.where(eq(members.id, existing.id))
				.run();
			return { id: existing.id, inserted: false };
		}

		const created = tx
			.insert(members)
			.values({ cycleId, ...input, telegram, linkedin })
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
	industry: string,
	/** CSV values win over the application's; nulls fall back to inheriting.
	 * Omit entirely (other call sites) to inherit both values. */
	contact?: { telegram: string | null; linkedin: string | null }
): { id: number; inserted: boolean } {
	const applicant = db
		.select({
			fullName: applicantPii.fullName,
			email: applicantPii.email,
			studentId: applicantPii.studentId,
			telegram: applicantPii.telegram,
			linkedinUrl: applicantPii.linkedinUrl
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
		applicantId,
		telegram: contact?.telegram ?? normalizeTelegram(applicant.telegram ?? ''),
		linkedin: contact?.linkedin ?? normalizeLinkedin(applicant.linkedinUrl ?? '')
	});
}

/**
 * The deliberate second write path into `members` (alongside upsertMember):
 * an admin correcting contact details. The only place that clears values —
 * blank means clear here, unlike imports, where blank means "not provided".
 * Throws user-facing messages the page actions pass through as-is.
 */
export function updateMemberContact(
	db: MemberDb,
	memberId: number,
	input: { telegram: string; linkedin: string }
): void {
	const member = db.select({ id: members.id }).from(members).where(eq(members.id, memberId)).get();
	if (!member) throw new Error('That member no longer exists.');

	const telegram = normalizeTelegram(input.telegram);
	if (input.telegram.trim() !== '' && telegram === null) {
		throw new Error(
			'That Telegram handle is not valid. Use the handle without "@", e.g. "adamentor".'
		);
	}
	const linkedin = normalizeLinkedin(input.linkedin);

	db.update(members).set({ telegram, linkedin }).where(eq(members.id, memberId)).run();
}
