import { describe, expect, it } from 'vitest';
import { makeTestDb } from '../../helpers/db';
import { cycles, members } from '../../../src/lib/server/db/schema';
import {
	MEMBER_TOKEN_TTL_MS,
	createMemberToken,
	resolveMemberToken
} from '../../../src/lib/server/auth/memberToken';
import type { AppDb } from '../../../src/lib/server/db';

function seedMember(db: AppDb, overrides: Partial<{ email: string; active: boolean }> = {}) {
	db.insert(cycles).values({ name: '10th Circle', year: 2026 }).run();
	db.insert(members)
		.values({
			cycleId: 1,
			role: 'mentee',
			fullName: 'Mentee One',
			email: overrides.email ?? 'mentee1@example.com',
			active: overrides.active ?? true
		})
		.run();
	return 1;
}

describe('member tokens', () => {
	it('resolves a freshly created token to its member', () => {
		const db = makeTestDb();
		const memberId = seedMember(db);
		const token = createMemberToken(db, memberId);
		expect(resolveMemberToken(db, token)?.id).toBe(memberId);
	});

	it('returns null for an unknown token', () => {
		const db = makeTestDb();
		seedMember(db);
		expect(resolveMemberToken(db, 'nonsense')).toBeNull();
	});

	it('returns null once the token has expired', () => {
		const db = makeTestDb();
		const memberId = seedMember(db);
		const now = new Date('2026-09-20T00:00:00Z');
		const token = createMemberToken(db, memberId, now);
		const later = new Date(now.getTime() + MEMBER_TOKEN_TTL_MS + 1000);
		expect(resolveMemberToken(db, token, later)).toBeNull();
	});

	it('returns null for a deactivated member', () => {
		const db = makeTestDb();
		const memberId = seedMember(db, { active: false });
		const token = createMemberToken(db, memberId);
		expect(resolveMemberToken(db, token)).toBeNull();
	});

	it('does not resolve a token to the wrong member', () => {
		const db = makeTestDb();
		const firstId = seedMember(db);
		db.insert(members)
			.values({ cycleId: 1, role: 'mentor', fullName: 'Mentor One', email: 'mentor1@example.com' })
			.run();
		const secondId = 2;

		const firstToken = createMemberToken(db, firstId);
		const secondToken = createMemberToken(db, secondId);

		expect(resolveMemberToken(db, firstToken)?.id).toBe(firstId);
		expect(resolveMemberToken(db, secondToken)?.id).toBe(secondId);
		expect(resolveMemberToken(db, firstToken)?.id).not.toBe(secondId);
	});
});
