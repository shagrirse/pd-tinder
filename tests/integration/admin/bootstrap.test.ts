import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTestDb } from '../../helpers/db';
import { users } from '../../../src/lib/server/db/schema';
import { bootstrapAdmin } from '../../../src/lib/server/admin/bootstrap';
import { createInvite, INVITE_TTL_MS, redeemInvite } from '../../../src/lib/server/auth/invite';
import type { AppDb } from '../../../src/lib/server/db';

// Keep the real implementations for everything else; the rollback test below
// makes createInvite fail on demand.
vi.mock('../../../src/lib/server/auth/invite', async (importOriginal) => {
	const original = await importOriginal<typeof import('../../../src/lib/server/auth/invite')>();
	return { ...original, createInvite: vi.fn(original.createInvite) };
});

let db: AppDb;

beforeEach(() => {
	db = makeTestDb();
});

describe('bootstrapAdmin', () => {
	it('creates an administrator with no password set', () => {
		const result = bootstrapAdmin(db, { name: 'First Admin', email: 'admin@example.com' })!;
		expect(result.userId).toBe(1);

		const user = db.select().from(users).get()!;
		expect(user.name).toBe('First Admin');
		expect(user.role).toBe('admin');
		expect(user.active).toBe(true);
		// The whole point: no secret is ever set or transmitted.
		expect(user.passwordHash).toBeNull();
	});

	it('returns an invite that actually redeems', async () => {
		const result = bootstrapAdmin(db, { name: 'First Admin', email: 'admin@example.com' })!;
		expect(await redeemInvite(db, result.token, 'a good long password')).toBe(result.userId);
	});

	it('issues an invite that expires on the normal schedule', async () => {
		const start = new Date('2026-08-25T00:00:00Z');
		const result = bootstrapAdmin(db, { name: 'A', email: 'a@example.com' }, start)!;

		const tooLate = new Date(start.getTime() + INVITE_TTL_MS + 1000);
		expect(await redeemInvite(db, result.token, 'a good long password', tooLate)).toBeNull();
	});

	it('normalises the email the way login looks it up', () => {
		bootstrapAdmin(db, { name: 'A', email: '  MiXeD@Example.COM ' });
		expect(db.select().from(users).get()!.email).toBe('mixed@example.com');
	});

	it('writes nothing when an administrator already exists', () => {
		db.insert(users).values({ name: 'Someone', email: 'someone@example.com', role: 'admin' }).run();

		expect(bootstrapAdmin(db, { name: 'Second', email: 'second@example.com' })).toBeNull();
		expect(db.select().from(users).all()).toHaveLength(1);
	});

	it('writes nothing when only a reviewer exists', () => {
		// Any account at all means this database is in use — refuse, whatever the role.
		db.insert(users).values({ name: 'Rev', email: 'rev@example.com', role: 'reviewer' }).run();

		expect(bootstrapAdmin(db, { name: 'Admin', email: 'admin@example.com' })).toBeNull();
		expect(db.select().from(users).all()).toHaveLength(1);
	});

	it('writes nothing when a deactivated user exists', () => {
		db.insert(users)
			.values({ name: 'Gone', email: 'gone@example.com', role: 'admin', active: false })
			.run();

		expect(bootstrapAdmin(db, { name: 'Admin', email: 'admin@example.com' })).toBeNull();
	});

	it('rejects a blank name', () => {
		expect(() => bootstrapAdmin(db, { name: '   ', email: 'a@example.com' })).toThrow();
		expect(db.select().from(users).all()).toHaveLength(0);
	});

	it('rejects an address that is not an email', () => {
		expect(() => bootstrapAdmin(db, { name: 'A', email: 'not-an-email' })).toThrow();
		expect(db.select().from(users).all()).toHaveLength(0);
	});

	it('rolls the user insert back when the invite cannot be created', () => {
		vi.mocked(createInvite).mockImplementationOnce(() => {
			throw new Error('invite write failed');
		});

		expect(() => bootstrapAdmin(db, { name: 'A', email: 'a@example.com' })).toThrow(
			'invite write failed'
		);
		// A failed invite must not leave a password-less administrator behind.
		expect(db.select().from(users).all()).toHaveLength(0);
	});
});
