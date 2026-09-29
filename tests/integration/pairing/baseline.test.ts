import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb, seedAdmin } from '../../helpers/db';
import {
	baselinePairings,
	baselinePreferences,
	cycles,
	members,
	pairingBaselines,
	pairings,
	preferences
} from '../../../src/lib/server/db/schema';
import { createMemberToken } from '../../../src/lib/server/auth/memberToken';
import { closeForm, reopenForm } from '../../../src/lib/server/pairing/form';
import { getLatestBaseline } from '../../../src/lib/server/pairing/baseline';
import { setPreferences } from '../../../src/lib/server/pairing/preferences';
import type { AppDb } from '../../../src/lib/server/db';

let db: AppDb;
let admin: number;
let mentors: number[];
let mentees: number[];

function addMember(role: 'mentor' | 'mentee', n: number) {
	return db
		.insert(members)
		.values({ cycleId: 1, role, fullName: `${role} ${n}`, email: `${role}${n}@example.com` })
		.returning({ id: members.id })
		.get().id;
}

/** Rank the given members 1–3, in order. */
function choices(ids: number[]) {
	return ids.map((choiceMemberId, i) => ({
		rank: (i + 1) as 1 | 2 | 3,
		choiceMemberId,
		reason: `reason ${i + 1}`
	}));
}

type PrefRow = { memberId: number; choiceMemberId: number; rank: number; reason: string };
function normalised(rows: PrefRow[]) {
	return rows
		.map(({ memberId, choiceMemberId, rank, reason }) => ({
			memberId,
			choiceMemberId,
			rank,
			reason
		}))
		.sort((a, b) => a.memberId - b.memberId || a.rank - b.rank);
}

function baselinePrefs(baselineId: number) {
	return normalised(
		db
			.select()
			.from(baselinePreferences)
			.where(eq(baselinePreferences.baselineId, baselineId))
			.all()
	);
}

beforeEach(() => {
	db = makeTestDb();
	db.insert(cycles).values({ name: '10th Circle', year: 2026 }).run();
	admin = seedAdmin(db);
	mentors = [1, 2, 3].map((n) => addMember('mentor', n));
	mentees = [1, 2, 3].map((n) => addMember('mentee', n));
	// Every member has a live link, so the form is open.
	for (const id of [...mentors, ...mentees]) createMemberToken(db, id);
});

describe('closeForm baseline capture', () => {
	it("saves every member's choices exactly as submitted", () => {
		setPreferences(db, mentors[0], choices([mentees[0], mentees[1], mentees[2]]));
		setPreferences(db, mentees[0], choices([mentors[0], mentors[1], mentors[2]]));

		const baselineId = closeForm(db, 1, admin);

		expect(baselineId).not.toBeNull();
		expect(baselinePrefs(baselineId!)).toEqual(normalised(db.select().from(preferences).all()));
	});

	it('stores the pure algorithm result, ignoring manual pairs, while live pairs keep them', () => {
		setPreferences(db, mentors[0], choices([mentees[0], mentees[1], mentees[2]]));
		setPreferences(db, mentees[0], choices([mentors[0], mentors[1], mentors[2]]));
		db.insert(pairings)
			.values({
				cycleId: 1,
				mentorMemberId: mentors[1],
				menteeMemberId: mentees[0],
				method: 'manual',
				overrideReason: 'agreed at the mixer'
			})
			.run();

		const baselineId = closeForm(db, 1, admin)!;

		const basePairs = db
			.select()
			.from(baselinePairings)
			.where(eq(baselinePairings.baselineId, baselineId))
			.all();
		expect(basePairs).toHaveLength(1);
		expect(basePairs[0]).toMatchObject({
			mentorMemberId: mentors[0],
			menteeMemberId: mentees[0],
			method: 'mutual_first',
			mentorRank: 1,
			menteeRank: 1
		});

		// The manual pair survives. (Other live pairs may form around it: with
		// mentee 1 locked, mentor 1 can still be paired one-sidedly.)
		const live = db.select().from(pairings).all();
		const manual = live.filter((p) => p.method === 'manual');
		expect(manual).toHaveLength(1);
		expect(
			live.some((p) => p.mentorMemberId === mentors[0] && p.menteeMemberId === mentees[0])
		).toBe(false);
		expect(manual[0]).toMatchObject({
			mentorMemberId: mentors[1],
			menteeMemberId: mentees[0],
			method: 'manual',
			overrideReason: 'agreed at the mixer'
		});
	});

	it('records who closed the form', () => {
		const baselineId = closeForm(db, 1, admin);
		expect(getLatestBaseline(db, 1)).toMatchObject({ id: baselineId, createdBy: admin });
	});

	it('saves an empty baseline when nobody has submitted', () => {
		const baselineId = closeForm(db, 1, admin);

		expect(baselineId).not.toBeNull();
		expect(baselinePrefs(baselineId!)).toEqual([]);
		expect(db.select().from(baselinePairings).all()).toEqual([]);
		expect(db.select().from(pairings).all()).toEqual([]);
	});

	it('returns null and saves nothing when the form is already closed', () => {
		expect(closeForm(db, 1, admin)).not.toBeNull();
		expect(closeForm(db, 1, admin)).toBeNull();
		expect(db.select().from(pairingBaselines).all()).toHaveLength(1);
	});

	it('creates a new baseline on a second close and leaves the first untouched', () => {
		setPreferences(db, mentors[0], choices([mentees[0], mentees[1], mentees[2]]));
		setPreferences(db, mentees[0], choices([mentors[0], mentors[1], mentors[2]]));
		const first = closeForm(db, 1, admin)!;
		const firstPrefs = baselinePrefs(first);

		reopenForm(db, 1);
		setPreferences(db, mentees[0], choices([mentors[1], mentors[0], mentors[2]]));
		const second = closeForm(db, 1, admin)!;

		expect(second).not.toBe(first);
		expect(getLatestBaseline(db, 1)?.id).toBe(second);
		expect(baselinePrefs(first)).toEqual(firstPrefs);
		expect(
			baselinePrefs(second).find((p) => p.memberId === mentees[0] && p.rank === 1)?.choiceMemberId
		).toBe(mentors[1]);
	});
});

describe('getLatestBaseline', () => {
	it('is null before the form has ever closed', () => {
		expect(getLatestBaseline(db, 1)).toBeNull();
	});
});
