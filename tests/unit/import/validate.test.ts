import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_COLUMN_MAPPING } from '../../../src/lib/server/import/columns';
import { parseCsv } from '../../../src/lib/server/import/parse';
import { validateImport } from '../../../src/lib/server/import/validate';

const parsed = parseCsv(readFileSync('tests/fixtures/applicants-sample.csv', 'utf8'));

describe('validateImport', () => {
	it('accepts the sample file with no blocking errors', () => {
		const report = validateImport(parsed, DEFAULT_COLUMN_MAPPING);
		expect(report.blocking).toEqual([]);
		expect(report.rowCount).toBe(2);
	});

	it('counts normalised first-choice industries', () => {
		const report = validateImport(parsed, DEFAULT_COLUMN_MAPPING);
		expect(report.industryCounts).toEqual({ Finance: 2 });
		expect(report.unknownIndustries).toEqual([]);
	});

	it('counts LinkedIn validity', () => {
		const report = validateImport(parsed, DEFAULT_COLUMN_MAPPING);
		expect(report.linkedin).toEqual({ valid: 1, missing: 1 });
	});

	it('reports a missing required field as blocking', () => {
		const mapping = { ...DEFAULT_COLUMN_MAPPING };
		delete mapping['which is your first industry choice?'];
		const report = validateImport(parsed, mapping);
		expect(report.missingFields).toContain('industry_1');
		expect(report.blocking.join(' ')).toContain('industry_1');
	});

	it('reports an unrecognised industry as blocking', () => {
		const broken = {
			headers: parsed.headers,
			rows: [{ ...parsed.rows[0], 'which is your first industry choice?': 'Aerospace' }]
		};
		const report = validateImport(broken, DEFAULT_COLUMN_MAPPING);
		expect(report.unknownIndustries).toEqual([{ value: 'Aerospace', count: 1 }]);
		expect(report.blocking.join(' ')).toContain('Aerospace');
	});

	it('reports duplicate student IDs as a warning, not blocking', () => {
		const duped = { headers: parsed.headers, rows: [parsed.rows[0], { ...parsed.rows[0] }] };
		const report = validateImport(duped, DEFAULT_COLUMN_MAPPING);
		expect(report.duplicateStudentIds).toEqual([{ studentId: '01000001', count: 2 }]);
		expect(report.blocking).toEqual([]);
	});

	it('reports a blank student ID as blocking', () => {
		const broken = {
			headers: parsed.headers,
			rows: [{ ...parsed.rows[0], 'smu student id (01234856)': '  ' }]
		};
		const report = validateImport(broken, DEFAULT_COLUMN_MAPPING);
		expect(report.rowsMissingStudentId).toBe(1);
		expect(report.blocking.join(' ')).toContain('student ID');
	});

	it('lists headers that are present but unmapped', () => {
		const withExtra = {
			headers: [...parsed.headers, 'Some New Question'],
			rows: [{ ...parsed.rows[0], 'some new question': 'an answer' }]
		};
		const report = validateImport(withExtra, DEFAULT_COLUMN_MAPPING);
		expect(report.unmappedHeaders).toContain('some new question');
		expect(report.blocking).toEqual([]);
	});
});
