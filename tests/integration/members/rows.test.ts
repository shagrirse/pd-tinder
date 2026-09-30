import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb, seedAdmin } from '../../helpers/db';
import { cycles, members } from '../../../src/lib/server/db/schema';
import { createMemberToken } from '../../../src/lib/server/auth/memberToken';
import { closeForm, reopenForm } from '../../../src/lib/server/pairing/form';
import { overridePair } from '../../../src/lib/server/pairing/override';
import { setPreferences } from '../../../src/lib/server/pairing/preferences';
import { runReconciliation } from '../../../src/lib/server/pairing/run';
import { listMemberRows } from '../../../src/lib/server/members/rows';
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

function choices(ids: number[]) {
	return ids.map((choiceMemberId, i) => ({
		rank: (i + 1) as 1 | 2 | 3,
		choiceMemberId,
		reason: `reason ${i + 1}`
	}));
}

const byId = (id: number) => listMemberRows(db, 1).find((r) => r.id === id)!;

beforeEach(() => {
	db = makeTestDb();
	db.insert(cycles).values({ name: '10th Circle', year: 2026 }).run();
	admin = seedAdmin(db);
	mentors = [1, 2, 3].map((n) => addMember('mentor', n));
	mentees = [1, 2, 3].map((n) => addMember('mentee', n));
	for (const id of [...mentors, ...mentees]) createMemberToken(db, id);
	// mentor 1 <-> mentee 1 name each other first. Nobody else submits.
	setPreferences(db, mentors[0], choices([mentees[0], mentees[1], mentees[2]]));
	setPreferences(db, mentees[0], choices([mentors[0], mentors[1], mentors[2]]));
});

describe('listMemberRows', () => {
	it('is empty for a cycle with no members', () => {
		db.insert(cycles).values({ name: 'Empty', year: 2027 }).run();
		expect(listMemberRows(db, 2)).toEqual([]);
	});

	it('gives one row per active member with submission and live choices', () => {
		const rows = listMemberRows(db, 1);
		expect(rows).toHaveLength(6);

		const first = byId(mentors[0]);
		expect(first).toMatchObject({
			role: 'mentor',
			fullName: 'mentor 1',
			submitted: true,
			pair: null,
			choicesFromBaseline: false,
			baselinePair: null
		});
		expect(first.choices).toEqual([
			{ rank: 1, memberId: mentees[0], name: 'mentee 1', reason: 'reason 1' },
			{ rank: 2, memberId: mentees[1], name: 'mentee 2', reason: 'reason 2' },
			{ rank: 3, memberId: mentees[2], name: 'mentee 3', reason: 'reason 3' }
		]);
		expect(byId(mentors[1])).toMatchObject({ submitted: false, choices: [] });
	});

	it('folds in live pairs after reconciliation', () => {
		runReconciliation(db, 1);
		expect(byId(mentors[0]).pair).toEqual({
			memberId: mentees[0],
			name: 'mentee 1',
			method: 'mutual_first',
			overrideReason: null
		});
		expect(byId(mentees[0]).pair?.name).toBe('mentor 1');
	});

	it('shows the baseline pair beside an override, and who got none of their choices', () => {
		closeForm(db, 1, admin);
		overridePair(db, 1, mentors[1], mentees[0], 'swap', admin);

		const mentee = byId(mentees[0]);
		expect(mentee.pair).toEqual({
			memberId: mentors[1],
			name: 'mentor 2',
			method: 'manual',
			overrideReason: 'swap'
		});
		expect(mentee.baselinePair).toEqual({
			memberId: mentors[0],
			name: 'mentor 1',
			method: 'mutual_first'
		});
		expect(mentee.choicesFromBaseline).toBe(true);
		// mentee 1 ranked mentor 2 second, so this is one of their choices.
		expect(mentee.gotNoChoice).toBe(false);
		// mentor 2 submitted nothing, so their pair is none of their choices.
		expect(byId(mentors[1]).gotNoChoice).toBe(true);
		// mentor 1 lost their pair to the override.
		expect(byId(mentors[0]).pair).toBeNull();
	});

	it('keeps showing baseline choices after a reopen changes live preferences', () => {
		closeForm(db, 1, admin);
		reopenForm(db, 1);
		setPreferences(db, mentees[0], choices([mentors[2], mentors[1], mentors[0]]));

		expect(byId(mentees[0]).choices[0]).toMatchObject({ rank: 1, name: 'mentor 1' });
	});
});
