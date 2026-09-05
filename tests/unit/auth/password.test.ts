import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../../src/lib/server/auth/password';

describe('password hashing', () => {
	it('verifies a correct password', async () => {
		const stored = await hashPassword('correct horse battery staple');
		expect(await verifyPassword('correct horse battery staple', stored)).toBe(true);
	});

	it('rejects an incorrect password', async () => {
		const stored = await hashPassword('correct horse battery staple');
		expect(await verifyPassword('wrong password', stored)).toBe(false);
	});

	it('produces a different hash each time for the same password', async () => {
		const a = await hashPassword('same');
		const b = await hashPassword('same');
		expect(a).not.toBe(b);
	});

	it('returns false for a malformed stored value instead of throwing', async () => {
		expect(await verifyPassword('anything', 'not-a-real-hash')).toBe(false);
		expect(await verifyPassword('anything', '')).toBe(false);
	});
});
