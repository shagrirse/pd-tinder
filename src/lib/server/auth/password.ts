import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
	password: string,
	salt: Buffer,
	keylen: number
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(SALT_LENGTH);
	const derived = await scrypt(password, salt, KEY_LENGTH);
	return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const [scheme, saltHex, hashHex] = stored.split('$');
	if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;

	let expected: Buffer;
	try {
		expected = Buffer.from(hashHex, 'hex');
	} catch {
		return false;
	}
	if (expected.length !== KEY_LENGTH) return false;

	const derived = await scrypt(password, Buffer.from(saltHex, 'hex'), KEY_LENGTH);
	return timingSafeEqual(derived, expected);
}
