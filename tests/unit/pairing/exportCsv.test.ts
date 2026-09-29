import { describe, expect, it } from 'vitest';
import { parse } from 'csv-parse/sync';
import {
	baselineCsv,
	overridesCsv,
	pairingsCsv,
	safeCell
} from '../../../src/lib/server/pairing/exportCsv';
import type { PairingRow } from '../../../src/lib/server/pairing/list';
import type { BaselineRecord, OverrideRecord } from '../../../src/lib/server/pairing/records';

function rowsOf(csv: string): Record<string, string>[] {
	return parse(csv, { columns: true, bom: true }) as Record<string, string>[];
}

const PAIR: PairingRow = {
	id: 1,
	method: 'mutual_first',
	overrideReason: null,
	createdAt: new Date('2026-10-12T00:00:00Z'),
	mentor: {
		id: 1,
		fullName: 'Priya Mentor',
		email: 'priya@example.com',
		industry: 'Finance',
		studentId: '01000001',
		applicantId: null,
		telegram: null,
		linkedin: null
	},
	mentee: {
		id: 2,
		fullName: 'Jordan Mentee',
		email: 'jordan@example.com',
		industry: 'Finance',
		studentId: '01000002',
		applicantId: null,
		telegram: null,
		linkedin: null
	}
};

describe('pairingsCsv', () => {
	it('includes one row per pair with names, emails, student ids, method, and reason', () => {
		const rows = rowsOf(pairingsCsv([PAIR]));
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			mentor_name: 'Priya Mentor',
			mentor_email: 'priya@example.com',
			mentor_student_id: '01000001',
			mentee_name: 'Jordan Mentee',
			mentee_email: 'jordan@example.com',
			mentee_student_id: '01000002',
			method: 'mutual_first',
			override_reason: ''
		});
	});

	it('carries an override reason when there is one', () => {
		const overridden: PairingRow = {
			...PAIR,
			method: 'manual',
			overrideReason: 'switched at the mixer'
		};
		const rows = rowsOf(pairingsCsv([overridden]));
		expect(rows[0].override_reason).toBe('switched at the mixer');
	});

	it('blanks a missing student id rather than printing "null"', () => {
		const noStudentId: PairingRow = { ...PAIR, mentor: { ...PAIR.mentor, studentId: null } };
		const rows = rowsOf(pairingsCsv([noStudentId]));
		expect(rows[0].mentor_student_id).toBe('');
	});

	it('includes contact columns, empty when unknown', () => {
		const rows = rowsOf(
			pairingsCsv([
				{
					...PAIR,
					mentor: { ...PAIR.mentor, telegram: 'priya', linkedin: 'priya-mentor' },
					mentee: { ...PAIR.mentee, telegram: null, linkedin: 'jordan-mentor' }
				}
			])
		);
		expect(rows[0]).toMatchObject({
			mentor_telegram: 'priya',
			mentor_linkedin: 'priya-mentor',
			mentee_telegram: '',
			mentee_linkedin: 'jordan-mentor'
		});
	});
});

const BASELINE_HEADER =
	'name,role,industry,student_id,email,choice_1,choice_1_reason,choice_2,choice_2_reason,choice_3,choice_3_reason,baseline_pair,baseline_method,their_rank_for_pair,pair_rank_for_them,baseline_created_at';
const OVERRIDES_HEADER =
	'created_at,created_by,mentor_name,mentor_student_id,mentee_name,mentee_student_id,reason,mentor_baseline_pair,mentee_baseline_pair,displaced_mentee,displaced_mentor,still_live';

const SAVED_AT = new Date('2026-10-12T08:00:00Z');

const SUBMITTED: BaselineRecord = {
	member: { ...PAIR.mentor, role: 'mentor' },
	choices: [
		{ rank: 1, name: 'Jordan Mentee', reason: 'same industry' },
		{ rank: 2, name: 'Alex Mentee', reason: 'shared interests' },
		{ rank: 3, name: 'Sam Mentee', reason: 'met at the mixer' }
	],
	pair: { name: 'Jordan Mentee', method: 'mutual_first', theirRank: 1, pairRank: 1 },
	baselineCreatedAt: SAVED_AT
};

describe('baselineCsv', () => {
	it('writes one row per member with choices, baseline pair and ranks', () => {
		const rows = rowsOf(baselineCsv([SUBMITTED]));
		expect(rows).toHaveLength(1);
		expect(rows[0]).toEqual({
			name: 'Priya Mentor',
			role: 'mentor',
			industry: 'Finance',
			student_id: '01000001',
			email: 'priya@example.com',
			choice_1: 'Jordan Mentee',
			choice_1_reason: 'same industry',
			choice_2: 'Alex Mentee',
			choice_2_reason: 'shared interests',
			choice_3: 'Sam Mentee',
			choice_3_reason: 'met at the mixer',
			baseline_pair: 'Jordan Mentee',
			baseline_method: 'mutual_first',
			their_rank_for_pair: '1',
			pair_rank_for_them: '1',
			baseline_created_at: '2026-10-12T08:00:00.000Z'
		});
	});

	it('leaves choice and pair columns blank for a member who neither submitted nor was paired', () => {
		const rows = rowsOf(baselineCsv([{ ...SUBMITTED, choices: [], pair: null }]));
		expect(rows[0]).toMatchObject({
			choice_1: '',
			choice_3_reason: '',
			baseline_pair: '',
			baseline_method: '',
			their_rank_for_pair: '',
			pair_rank_for_them: ''
		});
	});

	it('still writes the header when there are no members', () => {
		expect(baselineCsv([]).trim()).toBe(BASELINE_HEADER);
	});
});

const OVERRIDE: OverrideRecord = {
	createdAt: SAVED_AT,
	createdBy: 'Test Admin',
	mentorName: 'Sam Mentor',
	mentorStudentId: '02000003',
	menteeName: 'Jordan Mentee',
	menteeStudentId: null,
	reason: 'Jordan asked to switch',
	mentorBaselinePair: null,
	menteeBaselinePair: 'Priya Mentor',
	displacedMentee: null,
	displacedMentor: 'Priya Mentor',
	stillLive: true
};

describe('overridesCsv', () => {
	it('writes one row per logged override', () => {
		const rows = rowsOf(overridesCsv([OVERRIDE, { ...OVERRIDE, stillLive: false }]));
		expect(rows).toHaveLength(2);
		expect(rows[0]).toEqual({
			created_at: '2026-10-12T08:00:00.000Z',
			created_by: 'Test Admin',
			mentor_name: 'Sam Mentor',
			mentor_student_id: '02000003',
			mentee_name: 'Jordan Mentee',
			mentee_student_id: '',
			reason: 'Jordan asked to switch',
			mentor_baseline_pair: '',
			mentee_baseline_pair: 'Priya Mentor',
			displaced_mentee: '',
			displaced_mentor: 'Priya Mentor',
			still_live: 'yes'
		});
		expect(rows[1].still_live).toBe('no');
	});

	it('still writes the header when nothing has been overridden', () => {
		expect(overridesCsv([]).trim()).toBe(OVERRIDES_HEADER);
	});
});

describe('safeCell', () => {
	it.each(['=', '+', '-', '@', '\t', '\r'])(
		'prefixes a quote when a cell starts with %j',
		(char) => {
			expect(safeCell(`${char}SUM(A1)`)).toBe(`'${char}SUM(A1)`);
		}
	);

	it('leaves a normal value and an empty string unchanged', () => {
		expect(safeCell('Priya Mentor')).toBe('Priya Mentor');
		expect(safeCell('a=b')).toBe('a=b');
		expect(safeCell('')).toBe('');
	});
});

describe('formula neutralising in the generators', () => {
	it('neutralises a formula in a baseline choice reason', () => {
		const rows = rowsOf(
			baselineCsv([
				{
					...SUBMITTED,
					choices: [{ rank: 1, name: 'Jordan Mentee', reason: '=HYPERLINK("x")' }]
				}
			])
		);
		expect(rows[0].choice_1_reason).toBe(`'=HYPERLINK("x")`);
	});

	it('neutralises formulas in applicant-authored names and reasons in every export', () => {
		const evil = '=cmd|calc';
		const pairings = rowsOf(pairingsCsv([{ ...PAIR, mentor: { ...PAIR.mentor, fullName: evil } }]));
		expect(pairings[0].mentor_name).toBe(`'${evil}`);

		const baseline = rowsOf(
			baselineCsv([{ ...SUBMITTED, member: { ...SUBMITTED.member, fullName: evil } }])
		);
		expect(baseline[0].name).toBe(`'${evil}`);

		const overrides = rowsOf(overridesCsv([{ ...OVERRIDE, reason: '@reason' }]));
		expect(overrides[0].reason).toBe(`'@reason`);
	});
});
