import type { AppDb } from '../db';
import { users } from '../db/schema';
import { createInvite } from '../auth/invite';

export type BootstrapResult = { userId: number; token: string };

/**
 * Create the first administrator, once.
 *
 * Idempotent by design: if any account already exists this writes nothing and
 * returns null, so running it against a live database can never damage a cycle
 * in progress. That is the difference between this and `scripts/seed-dev.ts`,
 * which rebuilds the database and must never be pointed at production.
 *
 * No password is set. The caller shows the returned invite to the operator, who
 * chooses their own through the existing invite flow — which is what keeps this
 * deployment free of any stored secret.
 *
 * The existence check, the insert and the invite are one immediate transaction,
 * so a failure halfway can never leave an administrator with no password and no
 * invite, and concurrent invocations cannot both pass the empty check.
 */
export function bootstrapAdmin(
	db: AppDb,
	input: { name: string; email: string },
	now: Date = new Date()
): BootstrapResult | null {
	return db.transaction(
		(tx) => {
			// Any account at all, of any role and whether or not it is active, means
			// this database is already in use.
			const existing = tx.select({ id: users.id }).from(users).get();
			if (existing) return null;

			const name = input.name.trim();
			const email = input.email.trim().toLowerCase();

			if (name === '') throw new Error('A name is required.');
			if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
				throw new Error('That is not a valid email address.');
			}

			const userId = tx
				.insert(users)
				.values({ name, email, role: 'admin' })
				.returning({ id: users.id })
				.get().id;

			return { userId, token: createInvite(tx, userId, now) };
		},
		{ behavior: 'immediate' }
	);
}
