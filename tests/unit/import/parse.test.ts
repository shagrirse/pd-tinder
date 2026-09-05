import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '../../../src/lib/server/import/parse';

const fixture = readFileSync('tests/fixtures/applicants-sample.csv', 'utf8');

describe('parseCsv', () => {
	it('reads every data row', () => {
		expect(parseCsv(fixture).rows).toHaveLength(2);
	});

	it('keys rows by normalised header', () => {
		const { rows } = parseCsv(fixture);
		expect(rows[0]['full matriculated name']).toBe('Ada Fictional');
		expect(rows[0]['primary faculty']).toBe('Lee Kong Chian School of Business');
	});

	it('preserves newlines inside quoted answers', () => {
		const { rows } = parseCsv(fixture);
		expect(
			rows[0]['can you share 1-2 of your short-term and long-term goals respectively, and your current progress on them thus far?']
		).toContain('\n');
	});

	it('exposes the raw headers', () => {
		expect(parseCsv(fixture).headers).toHaveLength(23);
	});

	it('returns no rows for a headers-only file', () => {
		expect(parseCsv('a,b,c\n').rows).toHaveLength(0);
	});
});
