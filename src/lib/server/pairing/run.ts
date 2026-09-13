import { and, eq, inArray, ne } from 'drizzle-orm';
import type { AppDb } from '../db';
import { members, pairings, preferences } from '../db/schema';
import {
	reconcile,
	type MemberRef,
	type PreferenceRef,
	type ProposedPair,
	type ReconcileResult
} from './passes';

/**
 * Reconcile a cycle and persist the result.
 *
 * Non-manual pairings are deleted and rewritten, so this is re-runnable while
 * the form is open and picks up late submissions. Manual pairings are read back
 * in as locked and left alone. Spec §7.
 */
export function runReconciliation(db: AppDb, cycleId: number): ReconcileResult {
	return db.transaction((tx) => {
		const roster = tx
			.select({ id: members.id, role: members.role })
			.from(members)
			.where(and(eq(members.cycleId, cycleId), eq(members.active, true)))
			.all() satisfies MemberRef[];

		const rosterIds = roster.map((m) => m.id);

		const prefs = tx
			.select({
				memberId: preferences.memberId,
				rank: preferences.rank,
				choiceMemberId: preferences.choiceMemberId
			})
			.from(preferences)
			.where(inArray(preferences.memberId, rosterIds))
			.all() satisfies PreferenceRef[];

		const manual: ProposedPair[] = tx
			.select({
				mentorId: pairings.mentorMemberId,
				menteeId: pairings.menteeMemberId
			})
			.from(pairings)
			.where(and(eq(pairings.cycleId, cycleId), eq(pairings.method, 'manual')))
			.all()
			.map((row) => ({ ...row, method: 'manual' as const, mentorRank: null, menteeRank: null }));

		tx
			.delete(pairings)
			.where(and(eq(pairings.cycleId, cycleId), ne(pairings.method, 'manual')))
			.run();

		const result = reconcile(roster, prefs, manual);

		const computed = result.pairs.filter((p) => p.method !== 'manual');
		if (computed.length > 0) {
			tx
				.insert(pairings)
				.values(
					computed.map((p) => ({
						cycleId,
						mentorMemberId: p.mentorId,
						menteeMemberId: p.menteeId,
						method: p.method
					}))
				)
				.run();
		}

		return result;
	});
}
