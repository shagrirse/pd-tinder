import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../../helpers/db';
import { cycles, members } from '../../../src/lib/server/db/schema';
import { generateMemberTokens } from '../../../src/lib/server/roster/tokens';
import { resolveMemberToken } from '../../../src/lib/server/auth/memberToken';
import type { AppDb } from '../../../src/lib/server/db';

let db: AppDb;

function addMember(
	cycleId: number,
	role: 'mentor' | 'mentee',
	email: string,
	overrides: Partial<{ active: boolean }> = {}
) {
	return db
		.insert(members)
		.values({ cycleId, role, fullName: `Fixture ${email}`, email, active: overrides.active ?? true })
		.returning({ id: members.id })
		.get().id;
}

beforeEach(() => {
	db = makeTestDb();
	db.insert(cycles).values({ name: '10th Circle', year: 2026 }).run();
});

describe('generateMemberTokens', () => {
	it('issues a resolvable token for every active member in the cycle', () => {
		const mentor = addMember(1, 'mentor', 'mentor@example.com');
		const mentee = addMember(1, 'mentee', 'mentee@example.com');

		const rows = generateMemberTokens(db, 1);

		expect(rows).toHaveLength(2);
		const byId = new Map(rows.map((r) => [r.id, r.token]));
		expect(resolveMemberToken(db, byId.get(mentor)!)?.id).toBe(mentor);
		expect(resolveMemberToken(db, byId.get(mentee)!)?.id).toBe(mentee);
	});

	it('skips inactive members', () => {
		addMember(1, 'mentor', 'active@example.com');
		addMember(1, 'mentee', 'inactive@example.com', { active: false });

		const rows = generateMemberTokens(db, 1);

		expect(rows).toHaveLength(1);
		expect(rows[0].email).toBe('active@example.com');
	});

	it('only includes members of the given cycle', () => {
		db.insert(cycles).values({ name: '11th Circle', year: 2027 }).run();
		addMember(1, 'mentor', 'this-cycle@example.com');
		addMember(2, 'mentor', 'other-cycle@example.com');

		const rows = generateMemberTokens(db, 1);

		expect(rows).toHaveLength(1);
		expect(rows[0].email).toBe('this-cycle@example.com');
	});

	it('retires a member’s previous token so it no longer resolves', () => {
		const memberId = addMember(1, 'mentor', 'mentor@example.com');

		const first = generateMemberTokens(db, 1);
		const oldToken = first[0].token;
		const second = generateMemberTokens(db, 1);
		const newToken = second[0].token;

		expect(resolveMemberToken(db, oldToken)).toBeNull();
		expect(resolveMemberToken(db, newToken)?.id).toBe(memberId);
	});
});
