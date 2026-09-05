import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { AppDb } from '../db';
import { invites, users } from '../db/schema';
import { hashPassword } from './password';

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export function createInvite(
	db: Pick<AppDb, 'insert'>,
	userId: number,
	now: Date = new Date()
): string {
	const token = randomBytes(32).toString('base64url');
	db.insert(invites)
		.values({
			userId,
			tokenHash: hashToken(token),
			expiresAt: new Date(now.getTime() + INVITE_TTL_MS)
		})
		.run();
	return token;
}

export async function redeemInvite(
	db: AppDb,
	token: string,
	password: string,
	now: Date = new Date()
): Promise<number | null> {
	const invite = db
		.select()
		.from(invites)
		.where(
			and(eq(invites.tokenHash, hashToken(token)), isNull(invites.usedAt), gt(invites.expiresAt, now))
		)
		.get();

	if (!invite) return null;

	const passwordHash = await hashPassword(password);
	db.transaction((tx) => {
		tx.update(users).set({ passwordHash }).where(eq(users.id, invite.userId)).run();
		tx.update(invites).set({ usedAt: now }).where(eq(invites.id, invite.id)).run();
	});

	return invite.userId;
}
