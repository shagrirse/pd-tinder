import { stringify } from 'csv-stringify/sync';
import type { PairingRow } from './list';
import type { BaselineRecord, OverrideRecord } from './records';

/**
 * Spreadsheets evaluate a cell that starts with one of these characters as a
 * formula. Names and free-text reasons are user-authored, so a leading quote
 * turns such a value back into plain text.
 */
const FORMULA_TRIGGERS = /^[=+\-@\t\r]/;

export function safeCell(value: string): string {
	return FORMULA_TRIGGERS.test(value) ? `'${value}` : value;
}

// Explicit column lists so an export with no rows still has its header line.
const PAIRING_COLUMNS = [
	'mentor_name',
	'mentor_email',
	'mentor_telegram',
	'mentor_linkedin',
	'mentor_student_id',
	'mentee_name',
	'mentee_email',
	'mentee_telegram',
	'mentee_linkedin',
	'mentee_student_id',
	'method',
	'override_reason'
];

/** The pairing record for the programme's own use. Spec §8.1: names, emails, student IDs (the future attendance join key), method, and override reason. */
export function pairingsCsv(rows: PairingRow[]): string {
	const records = rows.map((row) => ({
		mentor_name: safeCell(row.mentor.fullName),
		mentor_email: safeCell(row.mentor.email),
		mentor_telegram: safeCell(row.mentor.telegram ?? ''),
		mentor_linkedin: safeCell(row.mentor.linkedin ?? ''),
		mentor_student_id: safeCell(row.mentor.studentId ?? ''),
		mentee_name: safeCell(row.mentee.fullName),
		mentee_email: safeCell(row.mentee.email),
		mentee_telegram: safeCell(row.mentee.telegram ?? ''),
		mentee_linkedin: safeCell(row.mentee.linkedin ?? ''),
		mentee_student_id: safeCell(row.mentee.studentId ?? ''),
		method: safeCell(row.method),
		override_reason: safeCell(row.overrideReason ?? '')
	}));

	return stringify(records, { header: true, columns: PAIRING_COLUMNS });
}

// Explicit column lists so an export with no rows still has its header line.
const BASELINE_COLUMNS = [
	'name',
	'role',
	'industry',
	'student_id',
	'email',
	'choice_1',
	'choice_1_reason',
	'choice_2',
	'choice_2_reason',
	'choice_3',
	'choice_3_reason',
	'baseline_pair',
	'baseline_method',
	'their_rank_for_pair',
	'pair_rank_for_them',
	'baseline_created_at'
];

/** The saved baseline, one row per member: who they chose and what the algorithm gave them. */
export function baselineCsv(records: BaselineRecord[]): string {
	const rows = records.map((r) => {
		const choice = (rank: number) => r.choices.find((c) => c.rank === rank);
		return {
			name: safeCell(r.member.fullName),
			role: safeCell(r.member.role),
			industry: safeCell(r.member.industry ?? ''),
			student_id: safeCell(r.member.studentId ?? ''),
			email: safeCell(r.member.email),
			choice_1: safeCell(choice(1)?.name ?? ''),
			choice_1_reason: safeCell(choice(1)?.reason ?? ''),
			choice_2: safeCell(choice(2)?.name ?? ''),
			choice_2_reason: safeCell(choice(2)?.reason ?? ''),
			choice_3: safeCell(choice(3)?.name ?? ''),
			choice_3_reason: safeCell(choice(3)?.reason ?? ''),
			baseline_pair: safeCell(r.pair?.name ?? ''),
			baseline_method: safeCell(r.pair?.method ?? ''),
			their_rank_for_pair: r.pair?.theirRank ?? '',
			pair_rank_for_them: r.pair?.pairRank ?? '',
			baseline_created_at: r.baselineCreatedAt.toISOString()
		};
	});
	return stringify(rows, { header: true, columns: BASELINE_COLUMNS });
}

const OVERRIDE_COLUMNS = [
	'created_at',
	'created_by',
	'mentor_name',
	'mentor_student_id',
	'mentee_name',
	'mentee_student_id',
	'reason',
	'mentor_baseline_pair',
	'mentee_baseline_pair',
	'displaced_mentee',
	'displaced_mentor',
	'still_live'
];

/** Every override ever made, oldest first, including ones later replaced. */
export function overridesCsv(records: OverrideRecord[]): string {
	const rows = records.map((r) => ({
		created_at: r.createdAt.toISOString(),
		created_by: safeCell(r.createdBy),
		mentor_name: safeCell(r.mentorName),
		mentor_student_id: safeCell(r.mentorStudentId ?? ''),
		mentee_name: safeCell(r.menteeName),
		mentee_student_id: safeCell(r.menteeStudentId ?? ''),
		reason: safeCell(r.reason),
		mentor_baseline_pair: safeCell(r.mentorBaselinePair ?? ''),
		mentee_baseline_pair: safeCell(r.menteeBaselinePair ?? ''),
		displaced_mentee: safeCell(r.displacedMentee ?? ''),
		displaced_mentor: safeCell(r.displacedMentor ?? ''),
		still_live: r.stillLive ? 'yes' : 'no'
	}));
	return stringify(rows, { header: true, columns: OVERRIDE_COLUMNS });
}
