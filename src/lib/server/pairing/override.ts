import { eq, inArray, or } from 'drizzle-orm';
import type { AppDb } from '../db';
import { members, pairingOverrides, pairings } from '../db/schema';
import { getLatestBaseline } from './baseline';

export type OverrideErrorCode =
	'not_found' | 'reason_required' | 'role_mismatch' | 'wrong_cycle' | 'no_baseline';

export class OverrideError extends Error {
	constructor(
		readonly code: OverrideErrorCode,
		message: string
	) {
		super(message);
		this.name = 'OverrideError';
	}
}

/**
 * Pair two members by hand, recording why and who did it.
 *
 * Requires a baseline (saved when the preference form closes), so every
 * override is measured against the members' own choices. Anyone displaced by
 * this call loses their pair and returns to the residual. The override,
 * including who it displaced, is appended to the override log in the same
 * transaction.
 */
export function overridePair(
	db: AppDb,
	cycleId: number,
	mentorMemberId: number,
	menteeMemberId: number,
	reason: string,
	actorUserId: number
): void {
	const trimmed = reason.trim();
	if (trimmed === '') throw new OverrideError('reason_required', 'An override needs a reason');

	const ids = [mentorMemberId, menteeMemberId];
	const found = db.select().from(members).where(inArray(members.id, ids)).all();
	if (found.length !== 2) throw new OverrideError('not_found', 'Both members must exist');

	const mentor = found.find((m) => m.id === mentorMemberId)!;
	const mentee = found.find((m) => m.id === menteeMemberId)!;

	if (mentor.role !== 'mentor' || mentee.role !== 'mentee') {
		throw new OverrideError(
			'role_mismatch',
			'Expected a mentor and a mentee, in that argument order'
		);
	}
	if (mentor.cycleId !== cycleId || mentee.cycleId !== cycleId) {
		throw new OverrideError('wrong_cycle', `Both members must belong to cycle ${cycleId}`);
	}

	const baseline = getLatestBaseline(db, cycleId);
	if (!baseline) {
		throw new OverrideError('no_baseline', 'Close the preference form before overriding a pair');
	}

	db.transaction((tx) => {
		const touching = or(
			eq(pairings.mentorMemberId, mentorMemberId),
			eq(pairings.menteeMemberId, menteeMemberId)
		);
		const previous = tx
			.select({ mentorMemberId: pairings.mentorMemberId, menteeMemberId: pairings.menteeMemberId })
			.from(pairings)
			.where(touching)
			.all();
		const mentorsOldPartner =
			previous.find((p) => p.mentorMemberId === mentorMemberId)?.menteeMemberId ?? null;
		const menteesOldPartner =
			previous.find((p) => p.menteeMemberId === menteeMemberId)?.mentorMemberId ?? null;

		tx.delete(pairings).where(touching).run();

		tx.insert(pairings)
			.values({
				cycleId,
				mentorMemberId,
				menteeMemberId,
				method: 'manual',
				overrideReason: trimmed
			})
			.run();

		tx.insert(pairingOverrides)
			.values({
				cycleId,
				baselineId: baseline.id,
				mentorMemberId,
				menteeMemberId,
				reason: trimmed,
				// Already paired with each other means nobody was displaced.
				displacedMenteeId: mentorsOldPartner === menteeMemberId ? null : mentorsOldPartner,
				displacedMentorId: menteesOldPartner === mentorMemberId ? null : menteesOldPartner,
				createdBy: actorUserId
			})
			.run();
	});
}
