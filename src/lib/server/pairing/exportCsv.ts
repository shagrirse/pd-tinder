import { stringify } from 'csv-stringify/sync';
import type { PairingRow } from './list';

/** The pairing record for the programme's own use. Spec §8.1: names, emails, student IDs (the future attendance join key), method, and override reason. */
export function pairingsCsv(rows: PairingRow[]): string {
	const records = rows.map((row) => ({
		mentor_name: row.mentor.fullName,
		mentor_email: row.mentor.email,
		mentor_telegram: row.mentor.telegram ?? '',
		mentor_linkedin: row.mentor.linkedin ?? '',
		mentor_student_id: row.mentor.studentId ?? '',
		mentee_name: row.mentee.fullName,
		mentee_email: row.mentee.email,
		mentee_telegram: row.mentee.telegram ?? '',
		mentee_linkedin: row.mentee.linkedin ?? '',
		mentee_student_id: row.mentee.studentId ?? '',
		method: row.method,
		override_reason: row.overrideReason ?? ''
	}));

	return stringify(records, { header: true });
}
