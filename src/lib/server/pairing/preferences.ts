import { eq, inArray } from 'drizzle-orm';
import type { AppDb } from '../db';
import { members, preferences } from '../db/schema';

export type ChoiceInput = { rank: 1 | 2 | 3; choiceMemberId: number; reason: string };

export type PreferenceErrorCode =
	| 'not_found'
	| 'inactive'
	| 'incomplete'
	| 'duplicate_choice'
	| 'same_role'
	| 'wrong_cycle';

export class PreferenceError extends Error {
	constructor(readonly code: PreferenceErrorCode, message: string) {
		super(message);
		this.name = 'PreferenceError';
	}
}

const REQUIRED_RANKS = [1, 2, 3];

/**
 * Replace a member's preference submission. Wholesale replacement is what makes
 * submissions revisable until the form closes, and it keeps the (member, rank)
 * uniqueness constraint satisfiable without an upsert dance.
 */
export function setPreferences(db: AppDb, memberId: number, choices: ChoiceInput[]): void {
	const member = db.select().from(members).where(eq(members.id, memberId)).get();
	if (!member) throw new PreferenceError('not_found', `No member ${memberId}`);
	if (!member.active) throw new PreferenceError('inactive', `Member ${memberId} is inactive`);

	const ranks = choices.map((c) => c.rank).sort((a, b) => a - b);
	if (ranks.length !== 3 || !REQUIRED_RANKS.every((r, i) => ranks[i] === r)) {
		throw new PreferenceError('incomplete', 'Exactly three choices, ranked 1, 2 and 3, are required');
	}

	const ids = choices.map((c) => c.choiceMemberId);
	if (new Set(ids).size !== ids.length) {
		throw new PreferenceError('duplicate_choice', 'The same member cannot be chosen twice');
	}

	const chosen = db.select().from(members).where(inArray(members.id, ids)).all();
	if (chosen.length !== ids.length) {
		throw new PreferenceError('not_found', 'One or more choices name an unknown member');
	}
	for (const c of chosen) {
		if (c.cycleId !== member.cycleId) {
			throw new PreferenceError('wrong_cycle', `Member ${c.id} belongs to another cycle`);
		}
		if (c.role === member.role) {
			throw new PreferenceError('same_role', `Member ${c.id} has the same role as the chooser`);
		}
	}

	db.transaction((tx) => {
		tx.delete(preferences).where(eq(preferences.memberId, memberId)).run();
		tx.insert(preferences)
			.values(
				choices.map((c) => ({
					memberId,
					choiceMemberId: c.choiceMemberId,
					rank: c.rank,
					reason: c.reason
				}))
			)
			.run();
	});
}
