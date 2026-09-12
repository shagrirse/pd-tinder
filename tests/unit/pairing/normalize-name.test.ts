import { describe, expect, it } from 'vitest';
import { normalizeName } from '../../../scripts/pairing-fixture/normalize-name';

describe('normalizeName', () => {
	it('lowercases and collapses whitespace', () => {
		expect(normalizeName('  Ada   FICTIONAL ').key).toBe('ada fictional');
	});

	it('strips a parenthesised industry suffix and returns it', () => {
		expect(normalizeName('Ada Fictional (Finance)')).toEqual({
			key: 'ada fictional',
			industry: 'Finance'
		});
	});

	it('returns a null industry when there is no suffix', () => {
		expect(normalizeName('Ada Fictional').industry).toBeNull();
	});

	it('strips a quoted nickname', () => {
		expect(normalizeName('Ada "Addy" Fictional').key).toBe('ada fictional');
	});

	it('strips trailing punctuation', () => {
		expect(normalizeName('Ada Fictional,').key).toBe('ada fictional');
	});

	it('normalises a non-breaking space', () => {
		expect(normalizeName('Ada Fictional').key).toBe('ada fictional');
	});

	it('leaves an unrecognised parenthetical out of the industry', () => {
		expect(normalizeName('Ada Fictional (Year 3)')).toEqual({
			key: 'ada fictional',
			industry: null
		});
	});

	it('returns an empty key for a blank name', () => {
		expect(normalizeName('   ').key).toBe('');
	});
});
