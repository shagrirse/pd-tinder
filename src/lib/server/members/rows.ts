import { asc, eq, inArray } from 'drizzle-orm';
import type { AppDb } from '../db';
import { baselinePairings, baselinePreferences, preferences } from '../db/schema';
import { getLatestBaseline } from '../pairing/baseline';
import { submissionStatus } from '../pairing/form';
import { activeRosterWithRole, computeResidual, listPairings } from '../pairing/list';
import { listRoster } from '../roster/list';
import type { MemberRow } from '../../members/rows';

/** Every active member of the cycle with pairing status folded in, for the members page. */
export function listMemberRows(db: AppDb, cycleId: number): MemberRow[] {
	const roster = activeRosterWithRole(db, cycleId);
	if (roster.length === 0) return [];

	const { mentors, mentees } = listRoster(db, cycleId);
	const nameOf = new Map([...mentors, ...mentees].map((m) => [m.id, m.fullName]));

	const submitted = new Set(submissionStatus(db, cycleId).submitted.map((m) => m.id));
	const gotNoChoice = new Set(computeResidual(db, cycleId).gotNoChoice.map((m) => m.id));

	const pairOf = new Map<number, NonNullable<MemberRow['pair']>>();
	for (const p of listPairings(db, cycleId)) {
		const shared = { method: p.method, overrideReason: p.overrideReason };
		pairOf.set(p.mentor.id, { memberId: p.mentee.id, name: p.mentee.fullName, ...shared });
		pairOf.set(p.mentee.id, { memberId: p.mentor.id, name: p.mentor.fullName, ...shared });
	}

	// Once the form has closed, the baseline is the record of who chose whom.
	const baseline = getLatestBaseline(db, cycleId);
	const choiceRows = baseline
		? db
				.select({
					memberId: baselinePreferences.memberId,
					choiceMemberId: baselinePreferences.choiceMemberId,
					rank: baselinePreferences.rank,
					reason: baselinePreferences.reason
				})
				.from(baselinePreferences)
				.where(eq(baselinePreferences.baselineId, baseline.id))
				.orderBy(asc(baselinePreferences.rank))
				.all()
		: db
				.select({
					memberId: preferences.memberId,
					choiceMemberId: preferences.choiceMemberId,
					rank: preferences.rank,
					reason: preferences.reason
				})
				.from(preferences)
				.where(
					inArray(
						preferences.memberId,
						roster.map((m) => m.id)
					)
				)
				.orderBy(asc(preferences.rank))
				.all();

	const baselinePairOf = new Map<number, NonNullable<MemberRow['baselinePair']>>();
	if (baseline) {
		const rows = db
			.select()
			.from(baselinePairings)
			.where(eq(baselinePairings.baselineId, baseline.id))
			.all();
		for (const p of rows) {
			baselinePairOf.set(p.mentorMemberId, {
				memberId: p.menteeMemberId,
				name: nameOf.get(p.menteeMemberId)!,
				method: p.method
			});
			baselinePairOf.set(p.menteeMemberId, {
				memberId: p.mentorMemberId,
				name: nameOf.get(p.mentorMemberId)!,
				method: p.method
			});
		}
	}

	return roster.map((member) => ({
		...member,
		submitted: submitted.has(member.id),
		pair: pairOf.get(member.id) ?? null,
		gotNoChoice: gotNoChoice.has(member.id),
		choices: choiceRows
			.filter((c) => c.memberId === member.id)
			.map((c) => ({
				rank: c.rank,
				memberId: c.choiceMemberId,
				name: nameOf.get(c.choiceMemberId)!,
				reason: c.reason
			})),
		choicesFromBaseline: baseline !== null,
		baselinePair: baselinePairOf.get(member.id) ?? null
	}));
}
