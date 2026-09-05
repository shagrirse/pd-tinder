import { REQUIRED_FIELD_KEYS } from './columns';
import { classifyLinkedin, normalizeIndustry } from './normalize';
import type { ParsedCsv } from './parse';

export type ValidationReport = {
	rowCount: number;
	missingFields: string[];
	unmappedHeaders: string[];
	industryCounts: Record<string, number>;
	unknownIndustries: { value: string; count: number }[];
	linkedin: { valid: number; missing: number };
	duplicateStudentIds: { studentId: string; count: number }[];
	rowsMissingStudentId: number;
	blocking: string[];
};

function invertMapping(mapping: Record<string, string>): Record<string, string> {
	const byField: Record<string, string> = {};
	for (const [header, field] of Object.entries(mapping)) byField[field] = header;
	return byField;
}

export function validateImport(
	parsed: ParsedCsv,
	mapping: Record<string, string>
): ValidationReport {
	const headerForField = invertMapping(mapping);
	const read = (row: Record<string, string>, field: string): string =>
		row[headerForField[field] ?? ''] ?? '';

	const missingFields = REQUIRED_FIELD_KEYS.filter((f) => !headerForField[f]);

	const presentHeaders = new Set(parsed.rows.flatMap((r) => Object.keys(r)));
	const unmappedHeaders = [...presentHeaders].filter((h) => !mapping[h]).sort();

	const industryCounts: Record<string, number> = {};
	const unknownCounts = new Map<string, number>();
	const linkedin = { valid: 0, missing: 0 };
	const studentIdCounts = new Map<string, number>();
	let rowsMissingStudentId = 0;

	for (const row of parsed.rows) {
		if (headerForField.industry_1) {
			const raw = read(row, 'industry_1');
			const industry = normalizeIndustry(raw);
			if (industry) industryCounts[industry] = (industryCounts[industry] ?? 0) + 1;
			else unknownCounts.set(raw, (unknownCounts.get(raw) ?? 0) + 1);
		}

		if (headerForField.linkedin) linkedin[classifyLinkedin(read(row, 'linkedin'))] += 1;

		const studentId = read(row, 'student_id').trim();
		if (studentId === '') rowsMissingStudentId += 1;
		else studentIdCounts.set(studentId, (studentIdCounts.get(studentId) ?? 0) + 1);
	}

	const unknownIndustries = [...unknownCounts.entries()].map(([value, count]) => ({ value, count }));
	const duplicateStudentIds = [...studentIdCounts.entries()]
		.filter(([, count]) => count > 1)
		.map(([studentId, count]) => ({ studentId, count }));

	const blocking: string[] = [];
	for (const field of missingFields) {
		blocking.push(`No column is mapped to the required field "${field}".`);
	}
	for (const { value, count } of unknownIndustries) {
		blocking.push(`Unrecognised first-choice industry "${value}" in ${count} row(s).`);
	}
	if (rowsMissingStudentId > 0) {
		blocking.push(`${rowsMissingStudentId} row(s) have a blank student ID.`);
	}

	return {
		rowCount: parsed.rows.length,
		missingFields: [...missingFields],
		unmappedHeaders,
		industryCounts,
		unknownIndustries,
		linkedin,
		duplicateStudentIds,
		rowsMissingStudentId,
		blocking
	};
}
