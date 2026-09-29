import { desc, eq, inArray } from 'drizzle-orm';
import type { AppDb, AppTx } from '../db';
import { baselinePairings, baselinePreferences, pairingBaselines, preferences } from '../db/schema';
import { reconcile } from './passes';
import { loadReconcileInputs } from './run';

export type BaselineMethod = 'mutual_first' | 'mutual_any' | 'one_sided';

export type BaselineSummary = { id: number; createdAt: Date; createdBy: number };

/**
 * Save the cycle's current choices and the algorithm's pairing of them, with
 * no manual overrides applied, as a new baseline. Runs inside the caller's
 * transaction so it lands atomically with the form closing.
 */
export function captureBaseline(tx: AppTx, cycleId: number, actorUserId: number): number {
	const baselineId = tx
		.insert(pairingBaselines)
		.values({ cycleId, createdBy: actorUserId })
		.returning({ id: pairingBaselines.id })
		.get().id;

	const { roster, prefs } = loadReconcileInputs(tx, cycleId);
	const rosterIds = roster.map((m) => m.id);

	if (rosterIds.length > 0) {
		const submitted = tx
			.select({
				memberId: preferences.memberId,
				choiceMemberId: preferences.choiceMemberId,
				rank: preferences.rank,
				reason: preferences.reason
			})
			.from(preferences)
			.where(inArray(preferences.memberId, rosterIds))
			.all();
		if (submitted.length > 0) {
			tx.insert(baselinePreferences)
				.values(submitted.map((row) => ({ baselineId, ...row })))
				.run();
		}
	}

	// No manual locks are passed in, so every pair is the algorithm's own.
	const { pairs } = reconcile(roster, prefs, []);
	if (pairs.length > 0) {
		tx.insert(baselinePairings)
			.values(
				pairs.map((p) => ({
					baselineId,
					mentorMemberId: p.mentorId,
					menteeMemberId: p.menteeId,
					method: p.method as BaselineMethod,
					mentorRank: p.mentorRank,
					menteeRank: p.menteeRank
				}))
			)
			.run();
	}

	return baselineId;
}

/** The cycle's authoritative baseline (the newest), or null if the form has never closed. */
export function getLatestBaseline(db: AppDb, cycleId: number): BaselineSummary | null {
	return (
		db
			.select({
				id: pairingBaselines.id,
				createdAt: pairingBaselines.createdAt,
				createdBy: pairingBaselines.createdBy
			})
			.from(pairingBaselines)
			.where(eq(pairingBaselines.cycleId, cycleId))
			.orderBy(desc(pairingBaselines.id))
			.get() ?? null
	);
}
