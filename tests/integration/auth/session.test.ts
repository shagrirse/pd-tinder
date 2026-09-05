import { describe, expect, it } from 'vitest';
import { makeTestDb } from '../../helpers/db';
import { users } from '../../../src/lib/server/db/schema';
import {
	SESSION_TTL_MS,
	createSession,
	destroySession,
	resolveSession
} from '../../../src/lib/server/auth/session';
import type { AppDb } from '../../../src/lib/server/db';

function seedUser(db: AppDb, overrides: Partial<{ active: boolean }> = {}) {
	db.insert(users)
		.values({
			name: 'Reviewer One',
			email: 'r1@example.com',
			passwordHash: 'scrypt$00$00',
			role: 'reviewer',
			active: overrides.active ?? true
		})
		.run();
	return 1;
}

describe('sessions', () => {
	it('resolves a freshly created session to its user', () => {
		const db = makeTestDb();
		const userId = seedUser(db);
		const token = createSession(db, userId);
		expect(resolveSession(db, token)?.email).toBe('r1@example.com');
	});

	it('returns null for an unknown token', () => {
		const db = makeTestDb();
		seedUser(db);
		expect(resolveSession(db, 'nonsense')).toBeNull();
	});

	it('returns null once the session has expired', () => {
		const db = makeTestDb();
		const userId = seedUser(db);
		const now = new Date('2026-08-25T00:00:00Z');
		const token = createSession(db, userId, now);
		const later = new Date(now.getTime() + SESSION_TTL_MS + 1000);
		expect(resolveSession(db, token, later)).toBeNull();
	});

	it('returns null for a deactivated user', () => {
		const db = makeTestDb();
		const userId = seedUser(db, { active: false });
		const token = createSession(db, userId);
		expect(resolveSession(db, token)).toBeNull();
	});

	it('destroys a session', () => {
		const db = makeTestDb();
		const userId = seedUser(db);
		const token = createSession(db, userId);
		destroySession(db, token);
		expect(resolveSession(db, token)).toBeNull();
	});
});
