import { and, asc, eq, isNull } from 'drizzle-orm';
import type { AppDb } from '../db';
import { assignments, claims, invites, users } from '../db/schema';
import { createInvite } from '../auth/invite';
import { CANONICAL_INDUSTRIES } from '../import/normalize';
import { getMySummary, type MySummary } from '../review/reviewed';

export type InviteState =
	| { kind: 'active' }
	| { kind: 'invited'; expiresAt: Date }
	| { kind: 'needs-invite' };

export type Person = {
	id: number;
	name: string;
	email: string;
	role: 'admin' | 'reviewer';
	active: boolean;
	industries: string[];
	inviteState: InviteState;
	summary: MySummary;
};

const EMPTY_SUMMARY: MySummary = { total: 0, like: 0, meh: 0, skip: 0, redFlags: 0 };

export function listPeople(
	db: AppDb,
	cycleId: number | null,
	now: Date = new Date()
): Person[] {
	const userRows = db
		.select({
			id: users.id,
			name: users.name,
			email: users.email,
			role: users.role,
			active: users.active,
			passwordHash: users.passwordHash
		})
		.from(users)
		.all();

	const assignmentRows =
		cycleId === null
			? []
			: db
					.select({ userId: assignments.userId, industry: assignments.industry })
					.from(assignments)
					.where(eq(assignments.cycleId, cycleId))
					.orderBy(asc(assignments.industry))
					.all();

	const industriesByUser = new Map<number, string[]>();
	for (const row of assignmentRows) {
		const list = industriesByUser.get(row.userId) ?? [];
		list.push(row.industry);
		industriesByUser.set(row.userId, list);
	}

	// Ascending id, so the last write for a user is their most recent invite.
	const inviteRows = db
		.select({ userId: invites.userId, expiresAt: invites.expiresAt, usedAt: invites.usedAt })
		.from(invites)
		.orderBy(asc(invites.id))
		.all();

	const latestInvite = new Map<number, { expiresAt: Date; usedAt: Date | null }>();
	for (const row of inviteRows) {
		latestInvite.set(row.userId, { expiresAt: row.expiresAt, usedAt: row.usedAt });
	}

	const people = userRows.map((user) => ({
		id: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
		active: user.active,
		industries: industriesByUser.get(user.id) ?? [],
		inviteState: deriveInviteState(user.passwordHash, latestInvite.get(user.id), now),
		summary: cycleId === null ? EMPTY_SUMMARY : getMySummary(db, user.id, cycleId)
	}));

	return people.sort((a, b) => {
		if (a.role !== b.role) return a.role === 'admin' ? -1 : 1;
		return a.name.localeCompare(b.name);
	});
}

function deriveInviteState(
	passwordHash: string | null,
	invite: { expiresAt: Date; usedAt: Date | null } | undefined,
	now: Date
): InviteState {
	if (passwordHash) return { kind: 'active' };
	if (invite && invite.usedAt === null && invite.expiresAt > now) {
		return { kind: 'invited', expiresAt: invite.expiresAt };
	}
	return { kind: 'needs-invite' };
}

export class PeopleError extends Error {}

export type CreatePersonInput = {
	name: string;
	email: string;
	role: 'admin' | 'reviewer';
	industries: string[];
};

const INDUSTRY_SET = new Set<string>(CANONICAL_INDUSTRIES);

export function createPerson(
	db: AppDb,
	cycleId: number,
	input: CreatePersonInput,
	now: Date = new Date()
): { userId: number; token: string } {
	const name = input.name.trim();
	const email = input.email.trim().toLowerCase();

	if (name === '') throw new PeopleError('A name is required.');
	if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
		throw new PeopleError('That is not a valid email address.');
	}
	if (input.role !== 'admin' && input.role !== 'reviewer') {
		throw new PeopleError('Role must be admin or reviewer.');
	}

	const industries = [...new Set(input.industries)];
	for (const industry of industries) {
		if (!INDUSTRY_SET.has(industry)) {
			throw new PeopleError(`"${industry}" is not one of the recruitment industries.`);
		}
	}

	let userId: number;
	try {
		userId = db.transaction((tx) => {
			const created = tx
				.insert(users)
				.values({ name, email, role: input.role })
				.returning({ id: users.id })
				.get();

			if (industries.length > 0) {
				tx.insert(assignments)
					.values(industries.map((industry) => ({ userId: created.id, cycleId, industry })))
					.run();
			}

			return created.id;
		});
	} catch (cause) {
		// The unique index on users.email is the real guarantee under concurrency,
		// so the collision is caught here rather than pre-checked.
		if (cause instanceof Error && cause.message.includes('UNIQUE')) {
			throw new PeopleError('Someone with that email already exists.');
		}
		throw cause;
	}

	return { userId, token: createInvite(db, userId, now) };
}

export function regenerateInvite(db: AppDb, userId: number, now: Date = new Date()): string {
	const user = db
		.select({ passwordHash: users.passwordHash })
		.from(users)
		.where(eq(users.id, userId))
		.get();

	if (!user) throw new PeopleError('No such person.');
	if (user.passwordHash) {
		throw new PeopleError('That person has already set a password.');
	}

	// Retire first, issue second: a gap with no live invite is safe, two live
	// invites is not.
	db.update(invites)
		.set({ usedAt: now })
		.where(and(eq(invites.userId, userId), isNull(invites.usedAt)))
		.run();

	return createInvite(db, userId, now);
}

/**
 * Revoke or restore access. Deactivation flips `users.active`, which the login
 * handler and `resolveSession` both honour, so live sessions stop working on the
 * next request without any session row being deleted.
 *
 * Nothing else about the person is discarded. Their verdicts, ratings,
 * assignments, and invites stay exactly as they are, and results keep attributing
 * their work to them by name.
 */
export function setPersonActive(
	db: AppDb,
	actingUserId: number,
	targetUserId: number,
	active: boolean
): void {
	const target = db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.id, targetUserId))
		.get();

	if (!target) throw new PeopleError('No such person.');

	if (!active && actingUserId === targetUserId) {
		throw new PeopleError('You cannot deactivate your own account.');
	}

	db.transaction((tx) => {
		tx.update(users).set({ active }).where(eq(users.id, targetUserId)).run();

		if (!active) {
			// A claim is a two-hour lock, not a record of work. Someone with no access
			// is not mid-review, so release theirs rather than stranding those
			// applicants in nobody's pool until the TTL expires. Ratings and verdicts
			// are deliberately untouched.
			tx.delete(claims).where(eq(claims.userId, targetUserId)).run();
		}
	});
}
