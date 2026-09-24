import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../../helpers/db';
import { cycles, memberTokens, members, preferences } from '../../../src/lib/server/db/schema';
import { createMemberToken, resolveMemberToken } from '../../../src/lib/server/auth/memberToken';
import {
	closeForm,
	getFormStatus,
	reopenForm,
	submissionStatus
} from '../../../src/lib/server/pairing/form';
import type { AppDb } from '../../../src/lib/server/db';

let db: AppDb;
let mentor: number;
let mentee: number;

beforeEach(() => {
	db = makeTestDb();
	db.insert(cycles).values({ name: '10th Circle', year: 2026 }).run();
	mentor = db
		.insert(members)
		.values({ cycleId: 1, role: 'mentor', fullName: 'Priya Mentor', email: 'priya@example.com' })
		.returning({ id: members.id })
		.get().id;
	mentee = db
		.insert(members)
		.values({ cycleId: 1, role: 'mentee', fullName: 'Jordan Mentee', email: 'jordan@example.com' })
		.returning({ id: members.id })
		.get().id;
});

describe('getFormStatus', () => {
	it('is not_opened before any token exists', () => {
		expect(getFormStatus(db, 1)).toBe('not_opened');
	});

	it('is open once a live token exists', () => {
		createMemberToken(db, mentor);
		expect(getFormStatus(db, 1)).toBe('open');
	});

	it('is closed once every token has expired', () => {
		createMemberToken(db, mentor);
		closeForm(db, 1);
		expect(getFormStatus(db, 1)).toBe('closed');
	});
});

describe('closeForm / reopenForm', () => {
	it('denies access after close and regrants it after reopen, on the same token', () => {
		const token = createMemberToken(db, mentor);
		expect(resolveMemberToken(db, token)).not.toBeNull();

		closeForm(db, 1);
		expect(resolveMemberToken(db, token)).toBeNull();

		reopenForm(db, 1);
		expect(resolveMemberToken(db, token)).not.toBeNull();
	});

	it("only touches each member's most recently issued token", () => {
		// An already-expired earlier token, inserted directly — mirroring what
		// a real regeneration via generateMemberTokens leaves behind — rather
		// than relying on createMemberToken to retire it. createMemberToken
		// itself never touches other rows; only its caller does that.
		const past = new Date(Math.floor(Date.now() / 1000) * 1000 - 1000);
		db.insert(memberTokens)
			.values({ memberId: mentor, tokenHash: 'already-retired-hash', expiresAt: past })
			.run();

		const current = createMemberToken(db, mentor);
		closeForm(db, 1);

		expect(resolveMemberToken(db, current)).toBeNull();
		const rows = db.select().from(memberTokens).where(eq(memberTokens.memberId, mentor)).all();
		expect(rows).toHaveLength(2);
		// The already-expired row's expiresAt must be untouched by close —
		// proving closeForm only touches the newest row per member, not every row.
		const oldest = rows.find((r) => r.tokenHash === 'already-retired-hash')!;
		expect(oldest.expiresAt.getTime()).toBe(past.getTime());
	});

	it('does nothing when no member has ever had a token', () => {
		expect(() => closeForm(db, 1)).not.toThrow();
		expect(() => reopenForm(db, 1)).not.toThrow();
	});
});

describe('submissionStatus', () => {
	it('splits the roster by whether they have submitted preferences', () => {
		db.insert(preferences)
			.values({ memberId: mentee, choiceMemberId: mentor, rank: 1, reason: 'met at the mixer' })
			.run();

		const status = submissionStatus(db, 1);
		expect(status.submitted).toEqual([
			{
				id: mentee,
				role: 'mentee',
				fullName: 'Jordan Mentee',
				email: 'jordan@example.com',
				industry: null,
				studentId: null,
				applicantId: null,
				telegram: null,
				linkedin: null
			}
		]);
		expect(status.notSubmitted).toEqual([
			{
				id: mentor,
				role: 'mentor',
				fullName: 'Priya Mentor',
				email: 'priya@example.com',
				industry: null,
				studentId: null,
				applicantId: null,
				telegram: null,
				linkedin: null
			}
		]);
	});

	it('carries full member detail for the modal', () => {
		const db = makeTestDb();
		db.insert(cycles).values({ name: '10th Circle', year: 2026 }).run();
		db.insert(members)
			.values({
				cycleId: 1,
				role: 'mentor',
				fullName: 'Ada Mentor',
				email: 'ada@example.com',
				industry: 'Tech',
				studentId: '02000001',
				telegram: 'adamentor'
			})
			.run();

		const status = submissionStatus(db, 1);
		expect(status.notSubmitted[0]).toMatchObject({
			fullName: 'Ada Mentor',
			industry: 'Tech',
			studentId: '02000001',
			telegram: 'adamentor',
			linkedin: null,
			applicantId: null
		});
	});
});
