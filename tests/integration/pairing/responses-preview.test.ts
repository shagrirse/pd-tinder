import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../../helpers/db';
import { cycles, members } from '../../../src/lib/server/db/schema';
import { parseCsv } from '../../../src/lib/server/import/parse';
import { setPreferences } from '../../../src/lib/server/pairing/preferences';
import { previewResponses } from '../../../src/lib/server/pairing/responses';
import type { AppDb } from '../../../src/lib/server/db';

const HEADERS = [
	'Timestamp',
	'Full Name',
	'School Email Address',
	'School Admin ID',
	'I am a...',
	'First Choice of Mentee',
	'Reason for First Choice of Mentee',
	'Second Choice of Mentee',
	'Reason for Second Choice of Mentee',
	'Third Choice of Mentee',
	'Reason for Third Choice of Mentee',
	'First Choice of Mentor',
	'Reason for First Choice of Mentor',
	'Second Choice of Mentor',
	'Reason for Second Choice of Mentor',
	'Third Choice of Mentor',
	'Reason for Third Choice of Mentor'
];

const quote = (v: string) => `"${v.replace(/"/g, '""')}"`;

function toCsv(rows: Record<string, string>[], headers: string[] = HEADERS): string {
	return [
		headers.map(quote).join(','),
		...rows.map((r) => headers.map((h) => quote(r[h] ?? '')).join(','))
	].join('\n');
}

/** A mentor response choosing the three given mentees. */
function mentorRow(
	id: string,
	name: string,
	picks: [string, string, string],
	extra: Record<string, string> = {}
): Record<string, string> {
	return {
		Timestamp: '2026/10/12 9:00:00 AM',
		'Full Name': name,
		'School Email Address': `${name.split(' ')[0].toLowerCase()}@example.com`,
		'School Admin ID': id,
		'I am a...': 'Mentor',
		'First Choice of Mentee': picks[0],
		'Reason for First Choice of Mentee': 'r1',
		'Second Choice of Mentee': picks[1],
		'Reason for Second Choice of Mentee': 'r2',
		'Third Choice of Mentee': picks[2],
		'Reason for Third Choice of Mentee': 'r3',
		...extra
	};
}

function menteeRow(
	id: string,
	name: string,
	picks: [string, string, string],
	extra: Record<string, string> = {}
): Record<string, string> {
	return {
		Timestamp: '2026/10/12 9:00:00 AM',
		'Full Name': name,
		'School Email Address': `${name.split(' ')[0].toLowerCase()}@example.com`,
		'School Admin ID': id,
		'I am a...': 'Mentee',
		'First Choice of Mentor': picks[0],
		'Reason for First Choice of Mentor': 'm1',
		'Second Choice of Mentor': picks[1],
		'Reason for Second Choice of Mentor': 'm2',
		'Third Choice of Mentor': picks[2],
		'Reason for Third Choice of Mentor': 'm3',
		...extra
	};
}

let db: AppDb;
let ids: Record<string, number>;

function addMember(
	role: 'mentor' | 'mentee',
	fullName: string,
	studentId: string,
	email: string,
	active = true
): number {
	return db
		.insert(members)
		.values({ cycleId: 1, role, fullName, email, studentId, active })
		.returning({ id: members.id })
		.get().id;
}

const preview = (rows: Record<string, string>[], headers?: string[]) =>
	previewResponses(db, 1, parseCsv(toCsv(rows, headers)));

beforeEach(() => {
	db = makeTestDb();
	db.insert(cycles).values({ name: '10th Circle', year: 2026 }).run();
	ids = {
		priya: addMember('mentor', 'Priya Mentor', '02000001', 'priya@example.com'),
		sam: addMember('mentor', 'Sam Mentor', '02000002', 'sam@example.com'),
		alex: addMember('mentor', 'Alex Mentor', '02000003', 'alex@example.com'),
		jordan: addMember('mentee', 'Jordan Mentee', '01000001', 'jordan@example.com'),
		casey: addMember('mentee', 'Casey Mentee', '01000002', 'casey@example.com'),
		robin: addMember('mentee', 'Robin Mentee', '01000003', 'robin@example.com')
	};
});

const MENTEES: [string, string, string] = ['Jordan Mentee', 'Casey Mentee', 'Robin Mentee'];
const MENTORS: [string, string, string] = ['Priya Mentor', 'Sam Mentor', 'Alex Mentor'];

describe('previewResponses: happy path', () => {
	it('plans ranked choices with reasons for a mentor and a mentee', () => {
		const { report, plan } = preview([
			mentorRow('02000001', 'Priya Mentor', MENTEES),
			menteeRow('01000001', 'Jordan Mentee', MENTORS)
		]);

		expect(report.blocking).toEqual([]);
		expect(report.errors).toEqual([]);
		expect(report.toImport).toBe(2);
		expect(plan).toEqual([
			{
				memberId: ids.priya,
				choices: [
					{ rank: 1, choiceMemberId: ids.jordan, reason: 'r1' },
					{ rank: 2, choiceMemberId: ids.casey, reason: 'r2' },
					{ rank: 3, choiceMemberId: ids.robin, reason: 'r3' }
				]
			},
			{
				memberId: ids.jordan,
				choices: [
					{ rank: 1, choiceMemberId: ids.priya, reason: 'm1' },
					{ rank: 2, choiceMemberId: ids.sam, reason: 'm2' },
					{ rank: 3, choiceMemberId: ids.alex, reason: 'm3' }
				]
			}
		]);
	});

	it('lists roster members who still have no choices', () => {
		const { report } = preview([mentorRow('02000001', 'Priya Mentor', MENTEES)]);
		expect(report.notYetSubmitted).toEqual([
			'Alex Mentor',
			'Casey Mentee',
			'Jordan Mentee',
			'Robin Mentee',
			'Sam Mentor'
		]);
	});

	it("ignores the other section's columns", () => {
		const { report } = preview([
			mentorRow('02000001', 'Priya Mentor', MENTEES, {
				'First Choice of Mentor': 'garbage',
				'Second Choice of Mentor': 'garbage'
			})
		]);
		expect(report.errors).toEqual([]);
		expect(report.toImport).toBe(1);
	});

	it('tolerates an autocorrected ellipsis in the role header', () => {
		const headers = HEADERS.map((h) => (h === 'I am a...' ? 'I am a\u2026' : h));
		const row = mentorRow('02000001', 'Priya Mentor', MENTEES);
		row['I am a\u2026'] = 'Mentor';
		const { report } = preview([row], headers);
		expect(report.blocking).toEqual([]);
		expect(report.toImport).toBe(1);
	});
});

describe('previewResponses: blocking', () => {
	it('blocks when a required header is missing', () => {
		const headers = HEADERS.filter((h) => h !== 'Reason for Third Choice of Mentor');
		const { report, plan } = preview([mentorRow('02000001', 'Priya Mentor', MENTEES)], headers);
		expect(report.missingHeaders).toEqual(['reason for third choice of mentor']);
		expect(report.blocking[0]).toContain('Missing columns');
		expect(plan).toEqual([]);
	});

	it('reports extra headers without blocking', () => {
		const headers = [...HEADERS, 'Comments'];
		const { report } = preview([mentorRow('02000001', 'Priya Mentor', MENTEES)], headers);
		expect(report.unmappedHeaders).toEqual(['Comments']);
		expect(report.blocking).toEqual([]);
	});

	it('shortens a very long extra header, such as a consent paragraph, in the report', () => {
		const consent = `By submitting this Form, you agree to the collection of your personal data.\n\nSecond paragraph with more detail than any report needs.`;
		const headers = [...HEADERS, consent];
		const { report } = preview([mentorRow('02000001', 'Priya Mentor', MENTEES)], headers);
		expect(report.blocking).toEqual([]);
		expect(report.unmappedHeaders).toHaveLength(1);
		expect(report.unmappedHeaders[0]).toHaveLength(60);
		expect(report.unmappedHeaders[0].endsWith('...')).toBe(true);
	});

	it('blocks when two members of a role share a normalised name', () => {
		addMember('mentee', 'jordan  mentee', '01000009', 'dup@example.com');
		const { report } = preview([mentorRow('02000001', 'Priya Mentor', MENTEES)]);
		expect(report.ambiguousNames).toEqual([{ role: 'mentee', name: 'Jordan Mentee', count: 2 }]);
		expect(report.blocking.join(' ')).toContain('share the name "Jordan Mentee"');
	});

	it('blocks when no response is valid', () => {
		const { report } = preview([mentorRow('09999999', 'Nobody', MENTEES)]);
		expect(report.blocking).toContain('No valid responses to import.');
	});

	it('does not count same-name members in different roles as ambiguous', () => {
		addMember('mentor', 'Jordan Mentee', '02000009', 'jm@example.com');
		const { report } = preview([mentorRow('02000001', 'Priya Mentor', MENTEES)]);
		expect(report.ambiguousNames).toEqual([]);
	});
});

describe('previewResponses: respondent', () => {
	it('reports an admin ID that is not on the roster', () => {
		const { report } = preview([mentorRow('09999999', 'Nobody', MENTEES)]);
		expect(report.errors).toEqual([
			{ response: 1, who: 'Nobody', message: 'School Admin ID "09999999" is not on the roster.' }
		]);
	});

	it('reports a blank admin ID', () => {
		const { report } = preview([mentorRow('', 'Blank Person', MENTEES)]);
		expect(report.errors[0].message).toBe('School Admin ID is blank.');
	});

	it('matches an admin ID whose leading zero was stripped', () => {
		const { report, plan } = preview([menteeRow('1000001', 'Jordan Mentee', MENTORS)]);
		expect(report.errors).toEqual([]);
		expect(plan[0].memberId).toBe(ids.jordan);
	});

	it('reports a role that contradicts the roster', () => {
		const { report } = preview([menteeRow('02000001', 'Priya Mentor', MENTORS)]);
		expect(report.errors[0].message).toBe(
			'They answered as a mentee, but the roster lists them as a mentor.'
		);
	});

	it('reports an unreadable role', () => {
		const { report } = preview([
			mentorRow('02000001', 'Priya Mentor', MENTEES, { 'I am a...': 'Admin' })
		]);
		expect(report.errors[0].message).toBe('"I am a..." must be Mentor or Mentee.');
	});

	it('warns, without skipping the row, when the typed name or email differs', () => {
		const { report } = preview([
			mentorRow('02000001', 'Priyanka M', MENTEES, { 'School Email Address': 'other@example.com' })
		]);
		expect(report.toImport).toBe(1);
		expect(report.errors).toEqual([]);
		expect(report.warnings.map((w) => w.message)).toEqual([
			'Typed name "Priyanka M" differs from the roster.',
			'Typed email "other@example.com" differs from the roster.'
		]);
	});

	it('warns when the signed-in email differs from the roster, and does not call the column unmapped', () => {
		const headers = [...HEADERS, 'Email Address'];
		const { report } = preview(
			[
				mentorRow('02000001', 'Priya Mentor', MENTEES, {
					'Email Address': 'someone.else@example.com'
				}),
				menteeRow('01000001', 'Jordan Mentee', MENTORS, { 'Email Address': 'JORDAN@example.com' })
			],
			headers
		);
		expect(report.unmappedHeaders).toEqual([]);
		expect(report.errors).toEqual([]);
		expect(report.toImport).toBe(2);
		expect(report.warnings.map((w) => [w.who, w.message])).toEqual([
			['Priya Mentor', 'Signed-in email "someone.else@example.com" differs from the roster.']
		]);
	});

	it('does not require the signed-in email column', () => {
		const { report } = preview([mentorRow('02000001', 'Priya Mentor', MENTEES)]);
		expect(report.blocking).toEqual([]);
		expect(report.warnings).toEqual([]);
	});
});

describe('previewResponses: choices', () => {
	it('reports an unknown name, a blank choice and a repeated choice', () => {
		const { report } = preview([
			mentorRow('02000001', 'Priya Mentor', ['Nobody Here', 'Casey Mentee', 'Robin Mentee']),
			mentorRow('02000002', 'Sam Mentor', ['Jordan Mentee', '', 'Robin Mentee']),
			mentorRow('02000003', 'Alex Mentor', ['Jordan Mentee', 'Jordan  Mentee', 'Robin Mentee'])
		]);
		expect(report.errors.map((e) => [e.who, e.message])).toEqual([
			['Priya Mentor', 'Rank 1 choice "Nobody Here" is not on the mentee roster.'],
			['Sam Mentor', 'Rank 2 choice is blank.'],
			['Alex Mentor', 'The same person is chosen more than once.']
		]);
		expect(report.toImport).toBe(0);
	});

	it('rejects a same-role choice as not on the opposite roster', () => {
		const { report } = preview([
			mentorRow('02000001', 'Priya Mentor', ['Sam Mentor', 'Casey Mentee', 'Robin Mentee'])
		]);
		expect(report.errors[0].message).toBe(
			'Rank 1 choice "Sam Mentor" is not on the mentee roster.'
		);
	});

	it('matches names ignoring case and spacing', () => {
		const { report, plan } = preview([
			mentorRow('02000001', 'Priya Mentor', ['  jordan MENTEE', 'casey  mentee', 'Robin Mentee'])
		]);
		expect(report.errors).toEqual([]);
		expect(plan[0].choices.map((c) => c.choiceMemberId)).toEqual([
			ids.jordan,
			ids.casey,
			ids.robin
		]);
	});

	it('treats a chosen member who is now inactive as an unknown name', () => {
		db.update(members).set({ active: false }).where(eq(members.id, ids.robin)).run();
		const { report } = preview([mentorRow('02000001', 'Priya Mentor', MENTEES)]);
		expect(report.errors[0].message).toBe(
			'Rank 3 choice "Robin Mentee" is not on the mentee roster.'
		);
	});

	it('allows a blank reason', () => {
		const { report, plan } = preview([
			mentorRow('02000001', 'Priya Mentor', MENTEES, { 'Reason for First Choice of Mentee': '' })
		]);
		expect(report.errors).toEqual([]);
		expect(plan[0].choices[0].reason).toBe('');
	});
});

describe('previewResponses: duplicates and existing choices', () => {
	it('lets the last row win and counts the superseded one', () => {
		const { report, plan } = preview([
			mentorRow('02000001', 'Priya Mentor', ['Jordan Mentee', 'Casey Mentee', 'Robin Mentee']),
			mentorRow('02000001', 'Priya Mentor', ['Robin Mentee', 'Casey Mentee', 'Jordan Mentee'])
		]);
		expect(report.superseded).toBe(1);
		expect(report.toImport).toBe(1);
		expect(plan[0].choices[0].choiceMemberId).toBe(ids.robin);
	});

	it('keeps existing choices when the last row is invalid, and says so', () => {
		setPreferences(db, ids.priya, [
			{ rank: 1, choiceMemberId: ids.jordan, reason: 'old' },
			{ rank: 2, choiceMemberId: ids.casey, reason: 'old' },
			{ rank: 3, choiceMemberId: ids.robin, reason: 'old' }
		]);
		const { report, plan } = preview([
			mentorRow('02000001', 'Priya Mentor', MENTEES),
			mentorRow('02000001', 'Priya Mentor', ['Nobody Here', 'Casey Mentee', 'Robin Mentee'])
		]);
		expect(plan).toEqual([]);
		expect(report.errors[0].message).toBe(
			'Rank 1 choice "Nobody Here" is not on the mentee roster. Their existing choices were kept.'
		);
		expect(report.notYetSubmitted).not.toContain('Priya Mentor');
	});

	it('counts people who already have choices as replaced', () => {
		setPreferences(db, ids.priya, [
			{ rank: 1, choiceMemberId: ids.jordan, reason: 'old' },
			{ rank: 2, choiceMemberId: ids.casey, reason: 'old' },
			{ rank: 3, choiceMemberId: ids.robin, reason: 'old' }
		]);
		const { report } = preview([
			mentorRow('02000001', 'Priya Mentor', MENTEES),
			menteeRow('01000001', 'Jordan Mentee', MENTORS)
		]);
		expect(report.toImport).toBe(2);
		expect(report.toReplace).toBe(1);
	});

	it('orders by row position, not by the Timestamp column', () => {
		const { plan } = preview([
			mentorRow('02000001', 'Priya Mentor', ['Jordan Mentee', 'Casey Mentee', 'Robin Mentee'], {
				Timestamp: '2026/10/13 9:00:00 AM'
			}),
			mentorRow('02000001', 'Priya Mentor', ['Robin Mentee', 'Casey Mentee', 'Jordan Mentee'], {
				Timestamp: '2026/10/12 9:00:00 AM'
			})
		]);
		expect(plan[0].choices[0].choiceMemberId).toBe(ids.robin);
	});
});
