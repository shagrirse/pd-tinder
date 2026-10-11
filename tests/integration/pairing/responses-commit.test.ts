import { beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { makeTestDb, seedAdmin } from '../../helpers/db';
import { cycles, members, preferences } from '../../../src/lib/server/db/schema';
import { parseCsv } from '../../../src/lib/server/import/parse';
import { closeForm } from '../../../src/lib/server/pairing/form';
import { getPreferences } from '../../../src/lib/server/pairing/preferences';
import { ResponsesError, commitResponses } from '../../../src/lib/server/pairing/responses';
import type { AppDb } from '../../../src/lib/server/db';

const HEADER =
	'Timestamp,Full Name,School Email Address,School Admin ID,I am a...,' +
	'First Choice of Mentee,Reason for First Choice of Mentee,Second Choice of Mentee,Reason for Second Choice of Mentee,Third Choice of Mentee,Reason for Third Choice of Mentee,' +
	'First Choice of Mentor,Reason for First Choice of Mentor,Second Choice of Mentor,Reason for Second Choice of Mentor,Third Choice of Mentor,Reason for Third Choice of Mentor';

const mentorLine = (id: string, name: string, picks: string[]) =>
	`t,${name},x@example.com,${id},Mentor,${picks[0]},r1,${picks[1]},r2,${picks[2]},r3,,,,,,`;
const menteeLine = (id: string, name: string, picks: string[]) =>
	`t,${name},x@example.com,${id},Mentee,,,,,,,${picks[0]},m1,${picks[1]},m2,${picks[2]},m3`;

let db: AppDb;
let admin: number;
let ids: Record<string, number>;

function addMember(role: 'mentor' | 'mentee', fullName: string, studentId: string) {
	return db
		.insert(members)
		.values({
			cycleId: 1,
			role,
			fullName,
			email: `${studentId}@example.com`,
			studentId
		})
		.returning({ id: members.id })
		.get().id;
}

beforeEach(() => {
	db = makeTestDb();
	db.insert(cycles).values({ name: '10th Circle', year: 2026 }).run();
	admin = seedAdmin(db);
	ids = {
		priya: addMember('mentor', 'Priya Mentor', '02000001'),
		sam: addMember('mentor', 'Sam Mentor', '02000002'),
		alex: addMember('mentor', 'Alex Mentor', '02000003'),
		jordan: addMember('mentee', 'Jordan Mentee', '01000001'),
		casey: addMember('mentee', 'Casey Mentee', '01000002'),
		robin: addMember('mentee', 'Robin Mentee', '01000003')
	};
});

const MENTEES = ['Jordan Mentee', 'Casey Mentee', 'Robin Mentee'];
const MENTORS = ['Priya Mentor', 'Sam Mentor', 'Alex Mentor'];

const file = (...lines: string[]) => parseCsv([HEADER, ...lines].join('\n'));

describe('commitResponses', () => {
	it('writes each planned member through setPreferences', () => {
		const summary = commitResponses(
			db,
			1,
			file(
				mentorLine('02000001', 'Priya Mentor', MENTEES),
				menteeLine('01000001', 'Jordan Mentee', MENTORS)
			)
		);

		expect(summary).toEqual({ imported: 2, replaced: 0 });
		expect(getPreferences(db, ids.priya).map((c) => c.choiceMemberId)).toEqual([
			ids.jordan,
			ids.casey,
			ids.robin
		]);
		expect(getPreferences(db, ids.jordan).map((c) => c.reason)).toEqual(['m1', 'm2', 'm3']);
	});

	it('is idempotent: importing the same file twice leaves the same state and reports a replace', () => {
		const parsed = file(mentorLine('02000001', 'Priya Mentor', MENTEES));

		commitResponses(db, 1, parsed);
		const first = db.select().from(preferences).all();
		const second = commitResponses(db, 1, parsed);

		expect(second).toEqual({ imported: 1, replaced: 1 });
		expect(
			db
				.select()
				.from(preferences)
				.all()
				.map(({ memberId, choiceMemberId, rank, reason }) => ({
					memberId,
					choiceMemberId,
					rank,
					reason
				}))
		).toEqual(
			first.map(({ memberId, choiceMemberId, rank, reason }) => ({
				memberId,
				choiceMemberId,
				rank,
				reason
			}))
		);
	});

	it('replaces a member’s earlier choices wholesale and leaves absent members alone', () => {
		commitResponses(
			db,
			1,
			file(
				mentorLine('02000001', 'Priya Mentor', MENTEES),
				mentorLine('02000002', 'Sam Mentor', MENTEES)
			)
		);
		commitResponses(
			db,
			1,
			file(
				mentorLine('02000001', 'Priya Mentor', ['Robin Mentee', 'Casey Mentee', 'Jordan Mentee'])
			)
		);

		expect(getPreferences(db, ids.priya)[0].choiceMemberId).toBe(ids.robin);
		expect(getPreferences(db, ids.sam)).toHaveLength(3);
	});

	it('refuses while the form is closed and writes nothing', () => {
		closeForm(db, 1, admin);

		expect(() =>
			commitResponses(db, 1, file(mentorLine('02000001', 'Priya Mentor', MENTEES)))
		).toThrowError(ResponsesError);
		expect(db.select().from(preferences).all()).toHaveLength(0);
	});

	it('refuses a file that blocks', () => {
		const call = () => commitResponses(db, 1, file(mentorLine('09999999', 'Nobody', MENTEES)));
		expect(call).toThrowError(ResponsesError);
		try {
			call();
		} catch (error) {
			expect((error as ResponsesError).code).toBe('blocked');
		}
	});

	it('rolls everything back when a later member fails to write', () => {
		// A trigger makes Sam's insert fail after Priya's has already been written.
		db.run(
			sql.raw(
				`CREATE TRIGGER fail_second BEFORE INSERT ON preferences WHEN NEW.member_id = ${ids.sam} BEGIN SELECT RAISE(ABORT, 'boom'); END`
			)
		);

		expect(() =>
			commitResponses(
				db,
				1,
				file(
					mentorLine('02000001', 'Priya Mentor', MENTEES),
					mentorLine('02000002', 'Sam Mentor', MENTEES)
				)
			)
		).toThrow();

		expect(
			db.select().from(preferences).where(eq(preferences.memberId, ids.priya)).all()
		).toHaveLength(0);
	});
});
