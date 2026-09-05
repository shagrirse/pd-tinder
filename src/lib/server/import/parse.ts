import { parse } from 'csv-parse/sync';
import { normalizeHeader } from './columns';

export type ParsedCsv = {
	headers: string[];
	rows: Record<string, string>[];
};

export function parseCsv(text: string): ParsedCsv {
	const table = parse(text, {
		bom: true,
		skip_empty_lines: true,
		relax_column_count: true
	}) as string[][];

	const [headerRow, ...dataRows] = table;
	if (!headerRow) return { headers: [], rows: [] };

	const normalized = headerRow.map(normalizeHeader);
	const rows = dataRows.map((cells) =>
		Object.fromEntries(normalized.map((key, i) => [key, cells[i] ?? '']))
	);

	return { headers: headerRow, rows };
}
