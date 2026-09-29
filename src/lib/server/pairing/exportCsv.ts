import { stringify } from 'csv-stringify/sync';
import type { PairingRow } from './list';
import type { BaselineRecord, OverrideRecord } from './records';

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
			name: r.member.fullName,
			role: r.member.role,
			industry: r.member.industry ?? '',
			student_id: r.member.studentId ?? '',
			email: r.member.email,
			choice_1: choice(1)?.name ?? '',
			choice_1_reason: choice(1)?.reason ?? '',
			choice_2: choice(2)?.name ?? '',
			choice_2_reason: choice(2)?.reason ?? '',
			choice_3: choice(3)?.name ?? '',
			choice_3_reason: choice(3)?.reason ?? '',
			baseline_pair: r.pair?.name ?? '',
			baseline_method: r.pair?.method ?? '',
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
		created_by: r.createdBy,
		mentor_name: r.mentorName,
		mentor_student_id: r.mentorStudentId ?? '',
		mentee_name: r.menteeName,
		mentee_student_id: r.menteeStudentId ?? '',
		reason: r.reason,
		mentor_baseline_pair: r.mentorBaselinePair ?? '',
		mentee_baseline_pair: r.menteeBaselinePair ?? '',
		displaced_mentee: r.displacedMentee ?? '',
		displaced_mentor: r.displacedMentor ?? '',
		still_live: r.stillLive ? 'yes' : 'no'
	}));
	return stringify(rows, { header: true, columns: OVERRIDE_COLUMNS });
}
