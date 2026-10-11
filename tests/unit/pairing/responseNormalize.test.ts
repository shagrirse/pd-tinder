import { describe, expect, it } from 'vitest';
import {
	duplicateNames,
	headerKey,
	normalizeAdminId,
	normalizeName,
	parseRole
} from '../../../src/lib/server/pairing/responseNormalize';

describe('normalizeName', () => {
	it('ignores case, outer whitespace and runs of internal whitespace', () => {
		expect(normalizeName('  Ada   LOVELACE ')).toBe('ada lovelace');
	});

	it('folds compatibility characters such as a non-breaking space', () => {
		expect(normalizeName('Ada Lovelace')).toBe('ada lovelace');
	});
});

describe('normalizeAdminId', () => {
	it('ignores leading zeros, so an ID Excel stripped still matches', () => {
		expect(normalizeAdminId('01234856')).toBe(normalizeAdminId('1234856'));
	});

	it('ignores whitespace and case', () => {
		expect(normalizeAdminId(' 0123 4856 ')).toBe('1234856');
		expect(normalizeAdminId('A0012')).toBe('a0012');
	});

	it('keeps a single zero for an all-zero ID and an empty string empty', () => {
		expect(normalizeAdminId('0000')).toBe('0');
		expect(normalizeAdminId('')).toBe('');
	});
});

describe('parseRole', () => {
	it('accepts Mentor and Mentee in any case', () => {
		expect(parseRole(' Mentor ')).toBe('mentor');
		expect(parseRole('MENTEE')).toBe('mentee');
	});

	it('rejects anything else', () => {
		expect(parseRole('')).toBeNull();
		expect(parseRole('Admin')).toBeNull();
	});
});

describe('headerKey', () => {
	it('lowercases and collapses whitespace like the other importers', () => {
		expect(headerKey('  First Choice  of Mentee ')).toBe('first choice of mentee');
	});

	it('treats a typographic ellipsis as three dots', () => {
		expect(headerKey('I am a…')).toBe('i am a...');
	});
});

describe('duplicateNames', () => {
	it('reports names that collide once normalised, with the first spelling and a count', () => {
		expect(duplicateNames(['Ada Lovelace', 'Bo Fictional', 'ada  lovelace'])).toEqual([
			{ name: 'Ada Lovelace', count: 2 }
		]);
	});

	it('returns nothing when every name is distinct', () => {
		expect(duplicateNames(['Ada', 'Bo'])).toEqual([]);
	});
});
