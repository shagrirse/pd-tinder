import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import type { AppDb } from '../db';
import { sessions, users } from '../db/schema';

export const SESSION_COOKIE = 'pdt_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type SessionUser = {
	id: number;
	name: string;
	email: string;
	role: 'admin' | 'reviewer';
};

function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export function createSession(db: AppDb, userId: number, now: Date = new Date()): string {
	const token = randomBytes(32).toString('base64url');
	db.insert(sessions)
		.values({
			id: hashToken(token),
			userId,
			expiresAt: new Date(now.getTime() + SESSION_TTL_MS)
		})
		.run();
	return token;
}

export function resolveSession(
	db: AppDb,
	token: string,
	now: Date = new Date()
): SessionUser | null {
	const row = db
		.select({
			id: users.id,
			name: users.name,
			email: users.email,
			role: users.role,
			active: users.active
		})
		.from(sessions)
		.innerJoin(users, eq(users.id, sessions.userId))
		.where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, now)))
		.get();

	if (!row || !row.active) return null;
	return { id: row.id, name: row.name, email: row.email, role: row.role };
}

export function destroySession(db: AppDb, token: string): void {
	db.delete(sessions).where(eq(sessions.id, hashToken(token))).run();
}
