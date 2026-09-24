import { describe, expect, it } from 'vitest';
import { normalizeLinkedin, normalizeTelegram } from '../../../src/lib/server/roster/contact';

describe('normalizeTelegram', () => {
	it('strips t.me prefixes and the @ to leave a bare handle', () => {
		expect(normalizeTelegram('@adafictional')).toBe('adafictional');
		expect(normalizeTelegram('https://t.me/adafictional')).toBe('adafictional');
		expect(normalizeTelegram('t.me/adafictional')).toBe('adafictional');
		expect(normalizeTelegram('  adafictional  ')).toBe('adafictional');
	});

	it('turns blank and invalid values into null', () => {
		expect(normalizeTelegram('')).toBeNull();
		expect(normalizeTelegram('   ')).toBeNull();
		expect(normalizeTelegram('https://t.me/')).toBeNull();
		expect(normalizeTelegram('bad handle!')).toBeNull();
		expect(normalizeTelegram('ab')).toBeNull();
	});
});

describe('normalizeLinkedin', () => {
	it('strips linkedin.com/in prefixes and trailing slashes', () => {
		expect(normalizeLinkedin('https://www.linkedin.com/in/ada-fictional')).toBe('ada-fictional');
		expect(normalizeLinkedin('linkedin.com/in/ada-fictional/')).toBe('ada-fictional');
		expect(normalizeLinkedin('ada-fictional')).toBe('ada-fictional');
	});

	it('turns blank values into null', () => {
		expect(normalizeLinkedin('')).toBeNull();
		expect(normalizeLinkedin('   ')).toBeNull();
		expect(normalizeLinkedin('https://www.linkedin.com/in/')).toBeNull();
	});
});
