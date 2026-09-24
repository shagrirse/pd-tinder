import { and, eq, gt } from 'drizzle-orm';
import type { AppDb } from '../db';
import { memberTokens, members } from '../db/schema';
import { createMemberToken } from '../auth/memberToken';

export type MemberTokenRow = {
	id: number;
	role: 'mentor' | 'mentee';
	fullName: string;
	email: string;
	token: string;
	telegram: string | null;
	linkedin: string | null;
};

/**
 * (Re)issue a token for every active member of a cycle. Retires any token
 * still live for a member before issuing their new one, mirroring
 * `regenerateInvite`: a member never has two live tokens, and an old link
 * stops working the moment a new one is generated.
 */
export function generateMemberTokens(
	db: AppDb,
	cycleId: number,
	now: Date = new Date()
): MemberTokenRow[] {
	const roster = db
		.select({
			id: members.id,
			role: members.role,
			fullName: members.fullName,
			email: members.email,
			telegram: members.telegram,
			linkedin: members.linkedin
		})
		.from(members)
		.where(and(eq(members.cycleId, cycleId), eq(members.active, true)))
		.all();

	return roster.map((member) => {
		db.update(memberTokens)
			.set({ expiresAt: now })
			.where(and(eq(memberTokens.memberId, member.id), gt(memberTokens.expiresAt, now)))
			.run();

		return { ...member, token: createMemberToken(db, member.id, now) };
	});
}
