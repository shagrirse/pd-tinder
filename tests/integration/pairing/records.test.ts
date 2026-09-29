import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb, seedAdmin } from '../../helpers/db';
import { cycles, members } from '../../../src/lib/server/db/schema';
import { createMemberToken } from '../../../src/lib/server/auth/memberToken';
import { closeForm } from '../../../src/lib/server/pairing/form';
import { overridePair } from '../../../src/lib/server/pairing/override';
import { setPreferences } from '../../../src/lib/server/pairing/preferences';
import { baselineRecords, overrideRecords } from '../../../src/lib/server/pairing/records';
import type { AppDb } from '../../../src/lib/server/db';

let db: AppDb;
let admin: number;
let mentors: number[];
let mentees: number[];

function addMember(role: 'mentor' | 'mentee', n: number) {
	return db
		.insert(members)
		.values({
			cycleId: 1,
			role,
			fullName: `${role} ${n}`,
			email: `${role}${n}@example.com`,
			studentId: `0${n}00000${role === 'mentor' ? 1 : 2}`
		})
		.returning({ id: members.id })
		.get().id;
}

function choices(ids: number[]) {
	return ids.map((choiceMemberId, i) => ({
		rank: (i + 1) as 1 | 2 | 3,
		choiceMemberId,
		reason: `reason ${i + 1}`
	}));
}

beforeEach(() => {
	db = makeTestDb();
	db.insert(cycles).values({ name: '10th Circle', year: 2026 }).run();
	admin = seedAdmin(db);
	mentors = [1, 2, 3].map((n) => addMember('mentor', n));
	mentees = [1, 2, 3].map((n) => addMember('mentee', n));
	for (const id of [...mentors, ...mentees]) createMemberToken(db, id);
	// mentor 1 <-> mentee 1 name each other first. Nobody else submits, so
	// everyone else is unpaired in the baseline.
	setPreferences(db, mentors[0], choices([mentees[0], mentees[1], mentees[2]]));
	setPreferences(db, mentees[0], choices([mentors[0], mentors[1], mentors[2]]));
});

describe('baselineRecords', () => {
	it('is null before the form has closed', () => {
		expect(baselineRecords(db, 1)).toBeNull();
	});

	it('gives every active member their choices and baseline pair', () => {
		closeForm(db, 1, admin);
		const records = baselineRecords(db, 1)!;

		expect(records).toHaveLength(6);
		const first = records.find((r) => r.member.id === mentors[0])!;
		expect(first.member.role).toBe('mentor');
		expect(first.choices).toEqual([
			{ rank: 1, name: 'mentee 1', reason: 'reason 1' },
			{ rank: 2, name: 'mentee 2', reason: 'reason 2' },
			{ rank: 3, name: 'mentee 3', reason: 'reason 3' }
		]);
		expect(first.pair).toEqual({
			name: 'mentee 1',
			method: 'mutual_first',
			theirRank: 1,
			pairRank: 1
		});

		const silent = records.find((r) => r.member.id === mentors[1])!;
		expect(silent.choices).toEqual([]);
		expect(silent.pair).toBeNull();
	});
});

describe('overrideRecords', () => {
	beforeEach(() => {
		closeForm(db, 1, admin);
	});

	it('is empty before any override', () => {
		expect(overrideRecords(db, 1)).toEqual([]);
	});

	it('names the author, both baseline pairs and who was displaced', () => {
		overridePair(db, 1, mentors[1], mentees[0], 'swap', admin);

		expect(overrideRecords(db, 1)).toEqual([
			{
				createdAt: expect.any(Date),
				createdBy: 'Test Admin',
				mentorName: 'mentor 2',
				mentorStudentId: '02000001',
				menteeName: 'mentee 1',
				menteeStudentId: '01000002',
				reason: 'swap',
				mentorBaselinePair: null,
				menteeBaselinePair: 'mentor 1',
				displacedMentee: null,
				displacedMentor: 'mentor 1',
				stillLive: true
			}
		]);
	});

	it('marks an override no longer live once a later override takes one of its members', () => {
		overridePair(db, 1, mentors[1], mentees[0], 'first', admin);
		overridePair(db, 1, mentors[2], mentees[0], 'second', admin);

		expect(overrideRecords(db, 1).map((r) => [r.reason, r.stillLive])).toEqual([
			['first', false],
			['second', true]
		]);
	});

	it('marks only the latest of two identical overrides as live', () => {
		overridePair(db, 1, mentors[1], mentees[0], 'first', admin);
		overridePair(db, 1, mentors[1], mentees[0], 'again', admin);

		expect(overrideRecords(db, 1).map((r) => [r.reason, r.stillLive])).toEqual([
			['first', false],
			['again', true]
		]);
	});
});
