import { and, asc, eq, inArray } from 'drizzle-orm';
import type { AppDb } from '../db';
import {
	baselinePairings,
	baselinePreferences,
	pairingOverrides,
	pairings,
	users
} from '../db/schema';
import { listRoster, type RosterRow } from '../roster/list';
import { getLatestBaseline, type BaselineMethod } from './baseline';
import { activeRosterWithRole, type MemberSummary } from './list';

export type BaselineRecord = {
	member: MemberSummary;
	choices: { rank: number; name: string; reason: string }[];
	pair: {
		name: string;
		method: BaselineMethod;
		/** The rank this member gave their baseline partner. */
		theirRank: number | null;
		/** The rank their baseline partner gave them. */
		pairRank: number | null;
	} | null;
	baselineCreatedAt: Date;
};

export type OverrideRecord = {
	createdAt: Date;
	createdBy: string;
	mentorName: string;
	mentorStudentId: string | null;
	menteeName: string;
	menteeStudentId: string | null;
	reason: string;
	mentorBaselinePair: string | null;
	menteeBaselinePair: string | null;
	displacedMentee: string | null;
	displacedMentor: string | null;
	stillLive: boolean;
};

/** Every member of the cycle (active or not) by id, for resolving names. */
function membersById(db: AppDb, cycleId: number): Map<number, RosterRow> {
	const { mentors, mentees } = listRoster(db, cycleId);
	return new Map([...mentors, ...mentees].map((m) => [m.id, m]));
}

/** One record per active member from the latest baseline, or null if there is none. */
export function baselineRecords(db: AppDb, cycleId: number): BaselineRecord[] | null {
	const baseline = getLatestBaseline(db, cycleId);
	if (!baseline) return null;

	const byId = membersById(db, cycleId);
	const nameOf = (id: number) => byId.get(id)!.fullName;

	const prefs = db
		.select()
		.from(baselinePreferences)
		.where(eq(baselinePreferences.baselineId, baseline.id))
		.orderBy(asc(baselinePreferences.rank))
		.all();
	const pairs = db
		.select()
		.from(baselinePairings)
		.where(eq(baselinePairings.baselineId, baseline.id))
		.all();

	return activeRosterWithRole(db, cycleId).map((member) => {
		const choices = prefs
			.filter((p) => p.memberId === member.id)
			.map((p) => ({ rank: p.rank, name: nameOf(p.choiceMemberId), reason: p.reason }));

		const asMentor = pairs.find((p) => p.mentorMemberId === member.id);
		const asMentee = pairs.find((p) => p.menteeMemberId === member.id);
		const pair = asMentor
			? {
					name: nameOf(asMentor.menteeMemberId),
					method: asMentor.method,
					theirRank: asMentor.mentorRank,
					pairRank: asMentor.menteeRank
				}
			: asMentee
				? {
						name: nameOf(asMentee.mentorMemberId),
						method: asMentee.method,
						theirRank: asMentee.menteeRank,
						pairRank: asMentee.mentorRank
					}
				: null;

		return { member, choices, pair, baselineCreatedAt: baseline.createdAt };
	});
}

/** Every logged override for the cycle, oldest first. */
export function overrideRecords(db: AppDb, cycleId: number): OverrideRecord[] {
	const rows = db
		.select({
			id: pairingOverrides.id,
			baselineId: pairingOverrides.baselineId,
			mentorMemberId: pairingOverrides.mentorMemberId,
			menteeMemberId: pairingOverrides.menteeMemberId,
			reason: pairingOverrides.reason,
			displacedMenteeId: pairingOverrides.displacedMenteeId,
			displacedMentorId: pairingOverrides.displacedMentorId,
			createdAt: pairingOverrides.createdAt,
			createdBy: users.name
		})
		.from(pairingOverrides)
		.innerJoin(users, eq(users.id, pairingOverrides.createdBy))
		.where(eq(pairingOverrides.cycleId, cycleId))
		.orderBy(asc(pairingOverrides.id))
		.all();
	if (rows.length === 0) return [];

	const byId = membersById(db, cycleId);
	const nameOf = (id: number | null) => (id === null ? null : byId.get(id)!.fullName);

	const basePairs = db
		.select()
		.from(baselinePairings)
		.where(inArray(baselinePairings.baselineId, [...new Set(rows.map((r) => r.baselineId))]))
		.all();
	const baselinePartner = (baselineId: number, memberId: number, role: 'mentor' | 'mentee') => {
		const pair = basePairs.find(
			(p) =>
				p.baselineId === baselineId &&
				(role === 'mentor' ? p.mentorMemberId : p.menteeMemberId) === memberId
		);
		if (!pair) return null;
		return nameOf(role === 'mentor' ? pair.menteeMemberId : pair.mentorMemberId);
	};

	const key = (mentorId: number, menteeId: number) => `${mentorId}:${menteeId}`;
	const liveManual = new Set(
		db
			.select({ mentorId: pairings.mentorMemberId, menteeId: pairings.menteeMemberId })
			.from(pairings)
			.where(and(eq(pairings.cycleId, cycleId), eq(pairings.method, 'manual')))
			.all()
			.map((p) => key(p.mentorId, p.menteeId))
	);
	// Rows are oldest first, so the last write per pair is its latest override.
	const latestForPair = new Map<string, number>();
	for (const r of rows) latestForPair.set(key(r.mentorMemberId, r.menteeMemberId), r.id);

	return rows.map((r) => {
		const pairKey = key(r.mentorMemberId, r.menteeMemberId);
		return {
			createdAt: r.createdAt,
			createdBy: r.createdBy,
			mentorName: byId.get(r.mentorMemberId)!.fullName,
			mentorStudentId: byId.get(r.mentorMemberId)!.studentId,
			menteeName: byId.get(r.menteeMemberId)!.fullName,
			menteeStudentId: byId.get(r.menteeMemberId)!.studentId,
			reason: r.reason,
			mentorBaselinePair: baselinePartner(r.baselineId, r.mentorMemberId, 'mentor'),
			menteeBaselinePair: baselinePartner(r.baselineId, r.menteeMemberId, 'mentee'),
			displacedMentee: nameOf(r.displacedMenteeId),
			displacedMentor: nameOf(r.displacedMentorId),
			stillLive: liveManual.has(pairKey) && latestForPair.get(pairKey) === r.id
		};
	});
}
