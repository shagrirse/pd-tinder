import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../../helpers/db';
import { users } from '../../../src/lib/server/db/schema';
import { INVITE_TTL_MS, createInvite, redeemInvite } from '../../../src/lib/server/auth/invite';
import { verifyPassword } from '../../../src/lib/server/auth/password';
import type { AppDb } from '../../../src/lib/server/db';

function seedUser(db: AppDb) {
	db.insert(users).values({ name: 'New Reviewer', email: 'new@example.com' }).run();
	return 1;
}

describe('invites', () => {
	it('sets the password and returns the user id when redeemed', async () => {
		const db = makeTestDb();
		const userId = seedUser(db);
		const token = createInvite(db, userId);

		expect(await redeemInvite(db, token, 'a good password')).toBe(userId);

		const user = db.select().from(users).where(eq(users.id, userId)).get();
		expect(await verifyPassword('a good password', user!.passwordHash!)).toBe(true);
	});

	it('cannot be redeemed twice', async () => {
		const db = makeTestDb();
		const token = createInvite(db, seedUser(db));
		await redeemInvite(db, token, 'first password');
		expect(await redeemInvite(db, token, 'second password')).toBeNull();
	});

	it('cannot be redeemed after expiry', async () => {
		const db = makeTestDb();
		const now = new Date('2026-08-25T00:00:00Z');
		const token = createInvite(db, seedUser(db), now);
		const later = new Date(now.getTime() + INVITE_TTL_MS + 1000);
		expect(await redeemInvite(db, token, 'too late', later)).toBeNull();
	});

	it('rejects an unknown token', async () => {
		const db = makeTestDb();
		seedUser(db);
		expect(await redeemInvite(db, 'nonsense', 'password')).toBeNull();
	});
});
