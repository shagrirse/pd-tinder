import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb, seedAdmin } from '../../helpers/db';
import { cycles, members, preferences } from '../../../src/lib/server/db/schema';
import { createMemberToken, resolveMemberToken } from '../../../src/lib/server/auth/memberToken';
import {
	closeForm,
	getFormStatus,
	reopenForm,
	submissionStatus
} from '../../../src/lib/server/pairing/form';
import { getLatestBaseline } from '../../../src/lib/server/pairing/baseline';
import type { AppDb } from '../../../src/lib/server/db';

let db: AppDb;
let admin: number;
let mentor: number;
let mentee: number;

beforeEach(() => {
	db = makeTestDb();
	db.insert(cycles).values({ name: '10th Circle', year: 2026 }).run();
	admin = seedAdmin(db);
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
	it('is open on a fresh cycle, with no member link ever issued', () => {
		expect(getFormStatus(db, 1)).toBe('open');
	});

	it('is closed once the form is closed', () => {
		closeForm(db, 1, admin);
		expect(getFormStatus(db, 1)).toBe('closed');
	});

	it('is open again after reopen', () => {
		closeForm(db, 1, admin);
		reopenForm(db, 1);
		expect(getFormStatus(db, 1)).toBe('open');
	});

	it('does not depend on member links: issuing one does not reopen a closed form', () => {
		closeForm(db, 1, admin);
		createMemberToken(db, mentor);
		expect(getFormStatus(db, 1)).toBe('closed');
	});
});

describe('closeForm / reopenForm', () => {
	it('closes and saves a baseline without any member link ever issued', () => {
		const baselineId = closeForm(db, 1, admin);

		expect(baselineId).not.toBeNull();
		expect(getLatestBaseline(db, 1)?.id).toBe(baselineId);
	});

	it('does nothing the second time, so a repeated close cannot stack baselines', () => {
		expect(closeForm(db, 1, admin)).not.toBeNull();
		expect(closeForm(db, 1, admin)).toBeNull();
	});

	it('leaves member tokens alone: closing is the flag, not token expiry', () => {
		const token = createMemberToken(db, mentor);

		closeForm(db, 1, admin);
		expect(resolveMemberToken(db, token)).not.toBeNull();

		reopenForm(db, 1);
		expect(resolveMemberToken(db, token)).not.toBeNull();
	});

	it('reopening an open form is harmless', () => {
		expect(() => reopenForm(db, 1)).not.toThrow();
		expect(getFormStatus(db, 1)).toBe('open');
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
