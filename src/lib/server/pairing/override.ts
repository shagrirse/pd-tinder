import { eq, inArray, or } from 'drizzle-orm';
import type { AppDb } from '../db';
import { members, pairings } from '../db/schema';

export type OverrideErrorCode = 'not_found' | 'reason_required' | 'role_mismatch' | 'wrong_cycle';

export class OverrideError extends Error {
	constructor(readonly code: OverrideErrorCode, message: string) {
		super(message);
		this.name = 'OverrideError';
	}
}

/**
 * Pair two members by hand, recording why.
 *
 * The 9th Circle's FINAL and TOTAL sheets differ by five pairs with no record of
 * the revision. Requiring a reason is what closes that gap. Spec §8.
 *
 * Anyone displaced by this call loses their pair and returns to the residual on
 * the next reconciliation run.
 */
export function overridePair(
	db: AppDb,
	cycleId: number,
	mentorMemberId: number,
	menteeMemberId: number,
	reason: string
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

	db.transaction((tx) => {
		tx
			.delete(pairings)
			.where(
				or(
					eq(pairings.mentorMemberId, mentorMemberId),
					eq(pairings.menteeMemberId, menteeMemberId)
				)
			)
			.run();

		tx
			.insert(pairings)
			.values({
				cycleId,
				mentorMemberId,
				menteeMemberId,
				method: 'manual',
				overrideReason: trimmed
			})
			.run();
	});
}
