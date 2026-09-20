import { asc, eq } from 'drizzle-orm';
import type { AppDb } from '../db';
import { members, pairings, preferences } from '../db/schema';
import { listActiveRoster, listRoster, type RosterRow } from '../roster/list';
import type { PairMethod } from './passes';

export type MemberSummary = RosterRow & { role: 'mentor' | 'mentee' };

/** Both roles' active roster, tagged with role, for views that mix mentors and mentees in one list. */
export function activeRosterWithRole(db: AppDb, cycleId: number): MemberSummary[] {
	const mentors = listActiveRoster(db, cycleId, 'mentor').map((m) => ({ ...m, role: 'mentor' as const }));
	const mentees = listActiveRoster(db, cycleId, 'mentee').map((m) => ({ ...m, role: 'mentee' as const }));
	return [...mentors, ...mentees];
}

export type PairingRow = {
	id: number;
	method: PairMethod;
	overrideReason: string | null;
	createdAt: Date;
	mentor: RosterRow;
	mentee: RosterRow;
};

/**
 * Every persisted pair for a cycle, mentor and mentee hydrated with their
 * roster details via a lookup rather than a self-join, matching how run.ts
 * assembles its own inputs from flat selects.
 */
export function listPairings(db: AppDb, cycleId: number): PairingRow[] {
	const roster = listRoster(db, cycleId);
	const byId = new Map<number, RosterRow>([...roster.mentors, ...roster.mentees].map((m) => [m.id, m]));

	return db
		.select({
			id: pairings.id,
			method: pairings.method,
			overrideReason: pairings.overrideReason,
			createdAt: pairings.createdAt,
			mentorMemberId: pairings.mentorMemberId,
			menteeMemberId: pairings.menteeMemberId
		})
		.from(pairings)
		.where(eq(pairings.cycleId, cycleId))
		.orderBy(asc(pairings.id))
		.all()
		.map((row) => ({
			id: row.id,
			method: row.method,
			overrideReason: row.overrideReason,
			createdAt: row.createdAt,
			mentor: byId.get(row.mentorMemberId)!,
			mentee: byId.get(row.menteeMemberId)!
		}));
}

export type ResidualStatus = {
	/** Active roster members with no persisted pairing. */
	unpaired: MemberSummary[];
	/** Paired members whose partner is not among their own submitted preferences. */
	gotNoChoice: MemberSummary[];
};

/**
 * Residual computed from persisted state (pairings + preferences), not by
 * re-running the reconciliation passes — so it reflects a manual override
 * immediately, with no second copy of passes.ts's logic to keep in sync.
 * Spec §8.1.
 */
export function computeResidual(db: AppDb, cycleId: number): ResidualStatus {
	const roster = activeRosterWithRole(db, cycleId);
	const byId = new Map(roster.map((m) => [m.id, m]));

	const pairingRows = db
		.select({ mentorMemberId: pairings.mentorMemberId, menteeMemberId: pairings.menteeMemberId })
		.from(pairings)
		.where(eq(pairings.cycleId, cycleId))
		.all();

	const pairedIds = new Set<number>();
	for (const row of pairingRows) {
		pairedIds.add(row.mentorMemberId);
		pairedIds.add(row.menteeMemberId);
	}
	const unpaired = roster.filter((m) => !pairedIds.has(m.id));

	const prefRows = db
		.select({ memberId: preferences.memberId, choiceMemberId: preferences.choiceMemberId })
		.from(preferences)
		.innerJoin(members, eq(members.id, preferences.memberId))
		.where(eq(members.cycleId, cycleId))
		.all();

	const choicesOf = new Map<number, Set<number>>();
	for (const row of prefRows) {
		if (!choicesOf.has(row.memberId)) choicesOf.set(row.memberId, new Set());
		choicesOf.get(row.memberId)!.add(row.choiceMemberId);
	}

	const gotNoChoice: MemberSummary[] = [];
	for (const row of pairingRows) {
		if (!choicesOf.get(row.mentorMemberId)?.has(row.menteeMemberId)) {
			gotNoChoice.push(byId.get(row.mentorMemberId)!);
		}
		if (!choicesOf.get(row.menteeMemberId)?.has(row.mentorMemberId)) {
			gotNoChoice.push(byId.get(row.menteeMemberId)!);
		}
	}

	return { unpaired, gotNoChoice };
}
