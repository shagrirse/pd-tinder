import { and, desc, eq, inArray } from 'drizzle-orm';
import type { AppDb } from '../db';
import { memberTokens, members, preferences } from '../db/schema';
import { MEMBER_TOKEN_TTL_MS } from '../auth/memberToken';

export type FormStatus = 'not_opened' | 'open' | 'closed';

// The close/reopen guarantee (Spec §8.1: same token, only its expiry moves) doesn't extend
// across a roster token regeneration — generateMemberTokens in ../roster/tokens.ts retires and
// reissues every active member's token, invalidating previously distributed links and flipping
// status back to 'open'.

/**
 * Each member's newest token row (by id), one per member who has ever had
 * one. Close and reopen both act on this row — never a new token value —
 * so a link already distributed keeps working across either operation.
 */
function latestTokenRows(db: AppDb, cycleId: number) {
	const roster = db.select({ id: members.id }).from(members).where(eq(members.cycleId, cycleId)).all();
	const rosterIds = roster.map((m) => m.id);
	if (rosterIds.length === 0) return [];

	const rows = db
		.select({ id: memberTokens.id, memberId: memberTokens.memberId, expiresAt: memberTokens.expiresAt })
		.from(memberTokens)
		.where(inArray(memberTokens.memberId, rosterIds))
		.orderBy(desc(memberTokens.id))
		.all();

	const latest = new Map<number, (typeof rows)[number]>();
	for (const row of rows) {
		if (!latest.has(row.memberId)) latest.set(row.memberId, row);
	}
	return [...latest.values()];
}

/** No token issued yet, at least one live, or all expired. Spec §8.1. */
export function getFormStatus(db: AppDb, cycleId: number, now: Date = new Date()): FormStatus {
	const latest = latestTokenRows(db, cycleId);
	if (latest.length === 0) return 'not_opened';
	return latest.some((row) => row.expiresAt > now) ? 'open' : 'closed';
}

export function closeForm(db: AppDb, cycleId: number, now: Date = new Date()): void {
	const ids = latestTokenRows(db, cycleId).map((row) => row.id);
	if (ids.length === 0) return;
	db.update(memberTokens).set({ expiresAt: now }).where(inArray(memberTokens.id, ids)).run();
}

export function reopenForm(db: AppDb, cycleId: number, now: Date = new Date()): void {
	const ids = latestTokenRows(db, cycleId).map((row) => row.id);
	if (ids.length === 0) return;
	const expiresAt = new Date(now.getTime() + MEMBER_TOKEN_TTL_MS);
	db.update(memberTokens).set({ expiresAt }).where(inArray(memberTokens.id, ids)).run();
}

export type SubmissionRow = { id: number; role: 'mentor' | 'mentee'; fullName: string; email: string };
export type SubmissionStatus = { submitted: SubmissionRow[]; notSubmitted: SubmissionRow[] };

/** Active roster split by whether a preferences row exists for them. */
export function submissionStatus(db: AppDb, cycleId: number): SubmissionStatus {
	const roster = db
		.select({ id: members.id, role: members.role, fullName: members.fullName, email: members.email })
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
