import { and, eq } from 'drizzle-orm';
import type { AppDb } from '../db';
import { cycles, members, preferences } from '../db/schema';
import { captureBaseline } from './baseline';
import { rebuildLivePairings } from './run';

export type FormStatus = 'open' | 'closed';

/**
 * Closed once the admin closes the form, open until then. The mark lives on the
 * cycle, so it does not depend on whether any member link was ever issued.
 */
export function getFormStatus(db: AppDb, cycleId: number): FormStatus {
	const row = db
		.select({ closedAt: cycles.preferencesClosedAt })
		.from(cycles)
		.where(eq(cycles.id, cycleId))
		.get();
	return row?.closedAt ? 'closed' : 'open';
}

/**
 * Close the form and save the pairing baseline, in one transaction: mark the
 * cycle closed, capture the baseline, then rebuild the live pairings from the
 * same (now frozen) choices, keeping manual pairs.
 *
 * Returns the new baseline's id, or null when the form was already closed, so
 * a repeated close cannot stack baselines.
 */
export function closeForm(
	db: AppDb,
	cycleId: number,
	actorUserId: number,
	now: Date = new Date()
): number | null {
	if (getFormStatus(db, cycleId) !== 'open') return null;

	return db.transaction((tx) => {
		tx.update(cycles).set({ preferencesClosedAt: now }).where(eq(cycles.id, cycleId)).run();
		const baselineId = captureBaseline(tx, cycleId, actorUserId);
		rebuildLivePairings(tx, cycleId);
		return baselineId;
	});
}

export function reopenForm(db: AppDb, cycleId: number): void {
	db.update(cycles).set({ preferencesClosedAt: null }).where(eq(cycles.id, cycleId)).run();
}

export type SubmissionRow = {
	id: number;
	role: 'mentor' | 'mentee';
	fullName: string;
	email: string;
	industry: string | null;
	studentId: string | null;
	applicantId: number | null;
	telegram: string | null;
	linkedin: string | null;
};
export type SubmissionStatus = { submitted: SubmissionRow[]; notSubmitted: SubmissionRow[] };

/** Active roster split by whether a preferences row exists for them. */
export function submissionStatus(db: AppDb, cycleId: number): SubmissionStatus {
	const roster = db
		.select({
			id: members.id,
			role: members.role,
			fullName: members.fullName,
			email: members.email,
			industry: members.industry,
			studentId: members.studentId,
			applicantId: members.applicantId,
			telegram: members.telegram,
			linkedin: members.linkedin
		})
		.from(members)
		.where(and(eq(members.cycleId, cycleId), eq(members.active, true)))
		.all();

	const submittedIds = new Set(
		db
			.select({ memberId: preferences.memberId })
			.from(preferences)
			.innerJoin(members, eq(members.id, preferences.memberId))
			.where(eq(members.cycleId, cycleId))
			.all()
			.map((r) => r.memberId)
	);

	const submitted: SubmissionRow[] = [];
	const notSubmitted: SubmissionRow[] = [];
	for (const m of roster) {
		(submittedIds.has(m.id) ? submitted : notSubmitted).push(m);
	}
	return { submitted, notSubmitted };
}
