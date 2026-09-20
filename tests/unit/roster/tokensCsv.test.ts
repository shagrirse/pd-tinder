import { describe, expect, it } from 'vitest';
import { parse } from 'csv-parse/sync';
import { memberTokensCsv } from '../../../src/lib/server/roster/tokensCsv';

function rowsOf(csv: string): Record<string, string>[] {
	return parse(csv, { columns: true, bom: true }) as Record<string, string>[];
}

describe('memberTokensCsv', () => {
	it('includes one row per member with role, name, email, and a full link', () => {
		const csv = memberTokensCsv(
			[{ id: 1, role: 'mentor', fullName: 'Ada Fictional', email: 'ada@example.com', token: 'abc123' }],
			'https://pdtinder.example.com'
		);

		const rows = rowsOf(csv);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			role: 'mentor',
			full_name: 'Ada Fictional',
			email: 'ada@example.com',
			link: 'https://pdtinder.example.com/member/abc123'
		});
	});
});
