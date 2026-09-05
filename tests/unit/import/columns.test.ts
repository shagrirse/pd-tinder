import { describe, expect, it } from 'vitest';
import {
	DEFAULT_COLUMN_MAPPING,
	QUESTION_KEYS,
	QUESTION_PROMPTS,
	RATED_QUESTION_KEYS,
	REQUIRED_FIELD_KEYS,
	normalizeHeader
} from '../../../src/lib/server/import/columns';

describe('normalizeHeader', () => {
	it('strips the trailing spaces present in the real form headers', () => {
		expect(normalizeHeader('Primary Faculty ')).toBe('primary faculty');
		expect(normalizeHeader('Have you been a Mentee in TMC before? ')).toBe(
			'have you been a mentee in tmc before?'
		);
	});

	it('collapses repeated internal whitespace', () => {
		expect(normalizeHeader('Contact   Number')).toBe('contact number');
	});
});

describe('DEFAULT_COLUMN_MAPPING', () => {
	it('maps every required field', () => {
		const mapped = new Set(Object.values(DEFAULT_COLUMN_MAPPING));
		for (const key of REQUIRED_FIELD_KEYS) expect(mapped).toContain(key);
	});

	it('maps all nine questions', () => {
		const mapped = new Set(Object.values(DEFAULT_COLUMN_MAPPING));
		for (const key of QUESTION_KEYS) expect(mapped).toContain(key);
	});

	it('uses normalised headers as its keys', () => {
		for (const header of Object.keys(DEFAULT_COLUMN_MAPPING)) {
			expect(header).toBe(normalizeHeader(header));
		}
	});
});

describe('question definitions', () => {
	it('rates eight of the nine questions', () => {
		expect(QUESTION_KEYS).toHaveLength(9);
		expect(RATED_QUESTION_KEYS).toHaveLength(8);
		expect(RATED_QUESTION_KEYS).not.toContain('q_key_events');
	});

	it('has a prompt for every question', () => {
		for (const key of QUESTION_KEYS) expect(QUESTION_PROMPTS[key]).toBeTruthy();
	});
});
