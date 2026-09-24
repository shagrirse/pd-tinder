import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../../helpers/db';
import { seedApplicant } from '../../helpers/applicants';
import { applicantPii, cycles, members } from '../../../src/lib/server/db/schema';
import { parseCsv } from '../../../src/lib/server/import/parse';
import { commitRoster } from '../../../src/lib/server/roster/commit';
import type { AppDb } from '../../../src/lib/server/db';

let db: AppDb;

beforeEach(() => {
	db = makeTestDb();
	db.insert(cycles).values({ name: '10th Circle', year: 2026 }).run();
});

describe('commitRoster — contact columns', () => {
	it('stores normalised CSV contact on mentor rows', () => {
		const csv = parseCsv(
			'full_name,email,industry,student_id,telegram,linkedin\nAda Mentor,ada.mentor@example.com,Tech,02000001,@adamentor,https://www.linkedin.com/in/ada-mentor\n'
		);
		commitRoster(db, 1, 'mentor', csv);
		expect(
			db.select().from(members).where(eq(members.email, 'ada.mentor@example.com')).get()
		).toMatchObject({
			telegram: 'adamentor',
			linkedin: 'ada-mentor'
		});
	});

	it('inherits the application contact when a matched mentee row leaves it blank', () => {
		const applicantId = seedApplicant(db, {
			cycleId: 1,
			publicRef: 1,
			industry1: 'Finance',
			fullName: 'Ada Fictional',
			email: 'ada@example.com',
			studentId: '01000001'
		});
		db.update(applicantPii)
			.set({ telegram: '@adafictional' })
			.where(eq(applicantPii.applicantId, applicantId))
			.run();

		commitRoster(
			db,
			1,
			'mentee',
			parseCsv(
				'student_id,industry,full_name,email,telegram\n01000001,Finance,Ada Fictional,ada@example.com,\n'
			)
		);
		expect(
			db.select().from(members).where(eq(members.email, 'ada@example.com')).get()
		).toMatchObject({
			telegram: 'adafictional',
			linkedin: null
		});
	});

	it('CSV contact wins over the application for matched mentees', () => {
		const applicantId = seedApplicant(db, {
			cycleId: 1,
			publicRef: 2,
			industry1: 'Finance',
			fullName: 'Bo Fictional',
			email: 'bo@example.com',
			studentId: '01000002'
		});
		db.update(applicantPii)
			.set({ telegram: '@bofictional' })
			.where(eq(applicantPii.applicantId, applicantId))
			.run();

		commitRoster(
			db,
			1,
			'mentee',
			parseCsv(
				'student_id,industry,full_name,email,telegram\n01000002,Finance,Bo Fictional,bo@example.com,csvhandle\n'
			)
		);
		expect(
			db.select().from(members).where(eq(members.email, 'bo@example.com')).get()!.telegram
		).toBe('csvhandle');
	});

	it('a direct mentee gets exactly what the CSV provides', () => {
		commitRoster(
			db,
			1,
			'mentee',
			parseCsv(
				'student_id,industry,full_name,email,telegram\n99999998,Finance,New Mentee,new@example.com,newmentee\n'
			)
		);
		expect(
			db.select().from(members).where(eq(members.email, 'new@example.com')).get()
		).toMatchObject({
			telegram: 'newmentee',
			linkedin: null,
			applicantId: null
		});
	});
});
