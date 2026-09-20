import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import type { AppDb } from '../db';
import { memberTokens, members } from '../db/schema';

// A backstop, not the real close trigger: it exists so a token cannot live
// forever, but the admin's future "close the form" action is what actually
// cuts access off. 60 days comfortably spans the whole Oct 5-18 window.
export const MEMBER_TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000;

export type TokenMember = {
	id: number;
	cycleId: number;
	role: 'mentor' | 'mentee';
	fullName: string;
};

function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export function createMemberToken(db: AppDb, memberId: number, now: Date = new Date()): string {
	const token = randomBytes(32).toString('base64url');
	db.insert(memberTokens)
		.values({
			memberId,
			tokenHash: hashToken(token),
			expiresAt: new Date(now.getTime() + MEMBER_TOKEN_TTL_MS)
		})
		.run();
	return token;
}

export function resolveMemberToken(
	db: AppDb,
	token: string,
	now: Date = new Date()
): TokenMember | null {
	const row = db
		.select({
			id: members.id,
			cycleId: members.cycleId,
			role: members.role,
			fullName: members.fullName,
			active: members.active
		})
		.from(memberTokens)
		.innerJoin(members, eq(members.id, memberTokens.memberId))
		.where(and(eq(memberTokens.tokenHash, hashToken(token)), gt(memberTokens.expiresAt, now)))
		.get();

	if (!row || !row.active) return null;
	return { id: row.id, cycleId: row.cycleId, role: row.role, fullName: row.fullName };
}
