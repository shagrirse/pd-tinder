import { stringify } from 'csv-stringify/sync';
import type { MemberTokenRow } from './tokens';

export function memberTokensCsv(rows: MemberTokenRow[], origin: string): string {
	const records = rows.map((row) => ({
		role: row.role,
		full_name: row.fullName,
		email: row.email,
		telegram: row.telegram ?? '',
		linkedin: row.linkedin ?? '',
		link: new URL(`/member/${row.token}`, origin).toString()
	}));

	return stringify(records, { header: true });
}
