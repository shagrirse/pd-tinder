import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../../helpers/db';
import {
	assignments,
	claims,
	cycles,
	invites,
	questions,
	ratings,
	users,
	verdicts
} from '../../../src/lib/server/db/schema';
import { INVITE_TTL_MS, createInvite, redeemInvite } from '../../../src/lib/server/auth/invite';
import { DEFAULT_COLUMN_MAPPING } from '../../../src/lib/server/import/columns';
import { parseCsv } from '../../../src/lib/server/import/parse';
import { commitImport } from '../../../src/lib/server/import/commit';
import { claimNext } from '../../../src/lib/server/review/claim';
import { submitVerdict } from '../../../src/lib/server/review/verdict';
import {
	PeopleError,
	createPerson,
	listPeople,
	regenerateInvite,
	setPersonActive
} from '../../../src/lib/server/admin/people';
import type { AppDb } from '../../../src/lib/server/db';

let db: AppDb;

beforeEach(() => {
	db = makeTestDb();
	db.insert(cycles).values({ name: 'C', year: 2026, status: 'reviewing' }).run();
});

describe('listPeople', () => {
	it('is empty when nobody exists', () => {
		expect(listPeople(db, 1)).toEqual([]);
	});

	it('lists admins before reviewers, then alphabetically', () => {
		db.insert(users)
			.values([
				{ name: 'Zoe Reviewer', email: 'zoe@example.com', role: 'reviewer' },
				{ name: 'Abe Reviewer', email: 'abe@example.com', role: 'reviewer' },
				{ name: 'Mia Admin', email: 'mia@example.com', role: 'admin' }
			])
			.run();

		expect(listPeople(db, 1).map((p) => p.name)).toEqual([
			'Mia Admin',
			'Abe Reviewer',
			'Zoe Reviewer'
		]);
	});

	it('reports the industries assigned for the cycle', () => {
		db.insert(users).values({ name: 'One', email: 'one@example.com' }).run();
		db.insert(assignments)
			.values([
				{ userId: 1, cycleId: 1, industry: 'Finance' },
				{ userId: 1, cycleId: 1, industry: 'Tech' }
			])
			.run();

		expect(listPeople(db, 1)[0].industries).toEqual(['Finance', 'Tech']);
	});

	it('does not leak assignments from another cycle', () => {
		db.insert(cycles).values({ name: 'Other', year: 2027 }).run();
		db.insert(users).values({ name: 'One', email: 'one@example.com' }).run();
		db.insert(assignments).values({ userId: 1, cycleId: 2, industry: 'Tech' }).run();

		expect(listPeople(db, 1)[0].industries).toEqual([]);
	});

	it('reports no industries and a zero summary when no cycle is open', () => {
		db.insert(users).values({ name: 'One', email: 'one@example.com' }).run();
		db.insert(assignments).values({ userId: 1, cycleId: 1, industry: 'Tech' }).run();

		const person = listPeople(db, null)[0];
		expect(person.industries).toEqual([]);
		expect(person.summary).toEqual({ total: 0, like: 0, meh: 0, skip: 0, redFlags: 0 });
	});

	it('marks a user who has set a password as active', () => {
		db.insert(users)
			.values({ name: 'One', email: 'one@example.com', passwordHash: 'scrypt$00$00' })
			.run();

		expect(listPeople(db, 1)[0].inviteState).toEqual({ kind: 'active' });
	});

	it('marks a user with a live unused invite as invited', () => {
		db.insert(users).values({ name: 'One', email: 'one@example.com' }).run();
		const now = new Date('2026-08-25T00:00:00Z');
		createInvite(db, 1, now);

		const state = listPeople(db, 1, now)[0].inviteState;
		expect(state.kind).toBe('invited');
		if (state.kind !== 'invited') throw new Error('expected an invited state');
		expect(state.expiresAt.getTime()).toBe(now.getTime() + INVITE_TTL_MS);
	});

	it('marks a user with no invite at all as needing one', () => {
		db.insert(users).values({ name: 'One', email: 'one@example.com' }).run();
		expect(listPeople(db, 1)[0].inviteState).toEqual({ kind: 'needs-invite' });
	});

	it('marks a user whose invite expired as needing one', () => {
		db.insert(users).values({ name: 'One', email: 'one@example.com' }).run();
		const now = new Date('2026-08-25T00:00:00Z');
		createInvite(db, 1, now);

		const later = new Date(now.getTime() + INVITE_TTL_MS + 1000);
		expect(listPeople(db, 1, later)[0].inviteState).toEqual({ kind: 'needs-invite' });
	});

	it('marks a user whose invite was already used as needing one', () => {
		db.insert(users).values({ name: 'One', email: 'one@example.com' }).run();
		const now = new Date('2026-08-25T00:00:00Z');
		createInvite(db, 1, now);
		db.update(invites).set({ usedAt: now }).run();

		expect(listPeople(db, 1, now)[0].inviteState).toEqual({ kind: 'needs-invite' });
	});

	it('judges invite state only from the most recent invite', () => {
		db.insert(users).values({ name: 'One', email: 'one@example.com' }).run();
		const old = new Date('2026-01-01T00:00:00Z');
		createInvite(db, 1, old);
		const fresh = new Date('2026-08-25T00:00:00Z');
		createInvite(db, 1, fresh);

		expect(listPeople(db, 1, fresh)[0].inviteState.kind).toBe('invited');
	});
});

describe('createPerson', () => {
	it('creates the user, their assignments, and a redeemable invite', async () => {
		const { userId, token } = createPerson(db, 1, {
			name: 'New Reviewer',
			email: 'new@example.com',
			role: 'reviewer',
			industries: ['Finance', 'Tech']
		});

		expect(userId).toBe(1);

		const person = listPeople(db, 1)[0];
		expect(person.name).toBe('New Reviewer');
		expect(person.role).toBe('reviewer');
		expect(person.industries).toEqual(['Finance', 'Tech']);
		expect(person.inviteState.kind).toBe('invited');

		expect(await redeemInvite(db, token, 'a good password')).toBe(userId);
	});

	it('normalises the email so it matches how login looks it up', () => {
		createPerson(db, 1, {
			name: 'Mixed Case',
			email: '  MiXeD@Example.COM  ',
			role: 'reviewer',
			industries: []
		});

		expect(listPeople(db, 1)[0].email).toBe('mixed@example.com');
	});

	it('creates an admin', () => {
		createPerson(db, 1, {
			name: 'An Admin',
			email: 'admin@example.com',
			role: 'admin',
			industries: []
		});

		expect(listPeople(db, 1)[0].role).toBe('admin');
	});

	it('rejects a blank name', () => {
		expect(() =>
			createPerson(db, 1, { name: '   ', email: 'a@example.com', role: 'reviewer', industries: [] })
		).toThrow(PeopleError);
	});

	it('rejects an email that is not an address', () => {
		expect(() =>
			createPerson(db, 1, { name: 'A', email: 'not-an-email', role: 'reviewer', industries: [] })
		).toThrow(PeopleError);
	});

	it('rejects an industry outside the canonical set', () => {
		expect(() =>
			createPerson(db, 1, {
				name: 'A',
				email: 'a@example.com',
				role: 'reviewer',
				industries: ['Aerospace']
			})
		).toThrow(PeopleError);
	});

	it('rejects a duplicate email and writes nothing', () => {
		createPerson(db, 1, {
			name: 'First',
			email: 'dupe@example.com',
			role: 'reviewer',
			industries: ['Finance']
		});

		expect(() =>
			createPerson(db, 1, {
				name: 'Second',
				email: 'dupe@example.com',
				role: 'reviewer',
				industries: ['Tech']
			})
		).toThrow(PeopleError);

		expect(listPeople(db, 1)).toHaveLength(1);
	});
});

describe('regenerateInvite', () => {
	it('issues a working invite and retires the previous one', async () => {
		const { userId, token: first } = createPerson(db, 1, {
			name: 'New Reviewer',
			email: 'new@example.com',
			role: 'reviewer',
			industries: ['Finance']
		});

		const second = regenerateInvite(db, userId);
		expect(second).not.toBe(first);

		expect(await redeemInvite(db, first, 'password one')).toBeNull();
		expect(await redeemInvite(db, second, 'password two')).toBe(userId);
	});

	it('recovers a user whose invite expired', async () => {
		const start = new Date('2026-08-25T00:00:00Z');
		const { userId } = createPerson(
			db,
			1,
			{ name: 'New Reviewer', email: 'new@example.com', role: 'reviewer', industries: [] },
			start
		);

		const later = new Date(start.getTime() + INVITE_TTL_MS + 1000);
		expect(listPeople(db, 1, later)[0].inviteState).toEqual({ kind: 'needs-invite' });

		const token = regenerateInvite(db, userId, later);
		expect(listPeople(db, 1, later)[0].inviteState.kind).toBe('invited');
		expect(await redeemInvite(db, token, 'a good password', later)).toBe(userId);
	});

	it('refuses for a user who already set a password', async () => {
		const { userId, token } = createPerson(db, 1, {
			name: 'New Reviewer',
			email: 'new@example.com',
			role: 'reviewer',
			industries: []
		});
		await redeemInvite(db, token, 'a good password');

		expect(() => regenerateInvite(db, userId)).toThrow(PeopleError);
	});

	it('refuses for an unknown user', () => {
		expect(() => regenerateInvite(db, 999)).toThrow(PeopleError);
	});
});

describe('setPersonActive', () => {
	const parsed = parseCsv(readFileSync('tests/fixtures/applicants-sample.csv', 'utf8'));

	/** An admin (id 1) and a reviewer (id 2) assigned to Finance, over the sample pool. */
	function seedAdminAndReviewer() {
		commitImport(db, 1, parsed, DEFAULT_COLUMN_MAPPING);
		createPerson(db, 1, {
			name: 'The Admin',
			email: 'admin@example.com',
			role: 'admin',
			industries: []
		});
		createPerson(db, 1, {
			name: 'The Reviewer',
			email: 'reviewer@example.com',
			role: 'reviewer',
			industries: ['Finance']
		});
	}

	it('revokes access without discarding submitted work', () => {
		seedAdminAndReviewer();
		claimNext(db, 2, 1, ['Finance']);
		submitVerdict(db, 2, 1, { overall: 'like', ratings: [] });

		setPersonActive(db, 1, 2, false);

		const person = listPeople(db, 1).find((p) => p.id === 2)!;
		expect(person.active).toBe(false);
		expect(person.name).toBe('The Reviewer');
		expect(person.email).toBe('reviewer@example.com');
		expect(person.industries).toEqual(['Finance']);
		expect(person.summary.total).toBe(1);

		// The work itself, and its attribution, survive untouched.
		expect(db.select().from(verdicts).where(eq(verdicts.userId, 2)).all()).toHaveLength(1);
	});

	it('keeps a deactivated reviewer attributable in results', () => {
		seedAdminAndReviewer();
		claimNext(db, 2, 1, ['Finance']);
		submitVerdict(db, 2, 1, {
			overall: 'like',
			ratings: [],
			note: 'still theirs'
		});

		setPersonActive(db, 1, 2, false);

		const verdict = db.select().from(verdicts).where(eq(verdicts.applicantId, 1)).get()!;
		expect(verdict.userId).toBe(2);
		expect(verdict.note).toBe('still theirs');
	});

	it('releases live claims so their applicants are not stranded', () => {
		seedAdminAndReviewer();
		claimNext(db, 2, 1, ['Finance']);
		expect(db.select().from(claims).all()).toHaveLength(1);

		setPersonActive(db, 1, 2, false);
		expect(db.select().from(claims).all()).toHaveLength(0);
	});

	it('leaves ratings in place when releasing claims', () => {
		seedAdminAndReviewer();
		const ratedId = db
			.select({ id: questions.id })
			.from(questions)
			.where(eq(questions.isRated, true))
			.all()[0].id;

		claimNext(db, 2, 1, ['Finance']);
		submitVerdict(db, 2, 1, {
			overall: 'like',
			ratings: [{ questionId: ratedId, value: 'like' }]
		});

		setPersonActive(db, 1, 2, false);
		expect(db.select().from(ratings).where(eq(ratings.userId, 2)).all()).toHaveLength(1);
	});

	it('reactivates', () => {
		seedAdminAndReviewer();
		setPersonActive(db, 1, 2, false);
		setPersonActive(db, 1, 2, true);

		expect(listPeople(db, 1).find((p) => p.id === 2)!.active).toBe(true);
	});

	it('refuses to let an admin deactivate themselves', () => {
		seedAdminAndReviewer();
		expect(() => setPersonActive(db, 1, 1, false)).toThrow(PeopleError);
		expect(listPeople(db, 1).find((p) => p.id === 1)!.active).toBe(true);
	});

	it('allows an admin to deactivate a different admin', () => {
		seedAdminAndReviewer();
		createPerson(db, 1, {
			name: 'Other Admin',
			email: 'other@example.com',
			role: 'admin',
			industries: []
		});

		setPersonActive(db, 1, 3, false);
		expect(listPeople(db, 1).find((p) => p.id === 3)!.active).toBe(false);
	});

	it('refuses for an unknown user', () => {
		seedAdminAndReviewer();
		expect(() => setPersonActive(db, 1, 999, false)).toThrow(PeopleError);
	});
});
