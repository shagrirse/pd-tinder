import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../../helpers/db';
import { seedApplicant } from '../../helpers/applicants';
import { cycles, members } from '../../../src/lib/server/db/schema';
import { promoteApplicant, upsertMember } from '../../../src/lib/server/roster/members';
import type { AppDb } from '../../../src/lib/server/db';

let db: AppDb;

beforeEach(() => {
	db = makeTestDb();
	db.insert(cycles).values({ name: '10th Circle', year: 2026 }).run();
});

const MENTOR: Parameters<typeof upsertMember>[2] = {
	role: 'mentor',
	fullName: 'Fixture Mentor',
	email: 'mentor@example.com',
	industry: 'Finance',
	studentId: '02000001',
	applicantId: null
};

describe('upsertMember', () => {
	it('inserts a mentor with all fields carried through', () => {
		const { id, inserted } = upsertMember(db, 1, MENTOR);
		expect(inserted).toBe(true);

		const row = db.select().from(members).where(eq(members.id, id)).get();
		expect(row).toMatchObject({
			cycleId: 1,
			role: 'mentor',
			fullName: 'Fixture Mentor',
			email: 'mentor@example.com',
			industry: 'Finance',
			studentId: '02000001',
			applicantId: null
		});
	});

	it('updates an existing member instead of duplicating, on re-import', () => {
		const first = upsertMember(db, 1, MENTOR);
		const second = upsertMember(db, 1, {
			...MENTOR,
			industry: 'Consulting',
			fullName: 'Renamed Mentor'
		});

		expect(second.id).toBe(first.id);
		expect(second.inserted).toBe(false);
		expect(db.select().from(members).all()).toHaveLength(1);

		const row = db.select().from(members).where(eq(members.id, first.id)).get();
		expect(row!.industry).toBe('Consulting');
		expect(row!.fullName).toBe('Renamed Mentor');
	});

	it('never revives a deactivated member on re-import', () => {
		const first = upsertMember(db, 1, MENTOR);
		db.update(members).set({ active: false }).where(eq(members.id, first.id)).run();

		upsertMember(db, 1, MENTOR);

		const row = db.select().from(members).where(eq(members.id, first.id)).get();
		expect(row!.active).toBe(false);
	});

	it('rejects a mentor and a mentee sharing an email in one cycle', () => {
		upsertMember(db, 1, MENTOR);
		expect(() => upsertMember(db, 1, { ...MENTOR, role: 'mentee', studentId: '01000001' })).toThrow(
			/already belongs to a mentor in this cycle/
		);
	});
});

describe('promoteApplicant', () => {
	beforeEach(() => {
		seedApplicant(db, {
			cycleId: 1,
			publicRef: 1,
			industry1: 'Finance',
			fullName: 'Ada Applicant',
			email: 'ada@example.com',
			studentId: '01000001'
		});
	});

	it('takes identity from the application and industry from its caller', () => {
		const { id } = promoteApplicant(db, 1, 1, 'mentee', 'Tech');

		const row = db.select().from(members).where(eq(members.id, id)).get();
		expect(row).toMatchObject({
			role: 'mentee',
			fullName: 'Ada Applicant',
			email: 'ada@example.com',
			studentId: '01000001',
			industry: 'Tech',
			applicantId: 1
		});
	});

	it('carries student_id onto the member row', () => {
		const { id } = promoteApplicant(db, 1, 1, 'mentee', 'Finance');
		const row = db.select().from(members).where(eq(members.id, id)).get();
		expect(row!.studentId).toBe('01000001');
	});

	it('throws when the applicant is not in this cycle', () => {
		db.insert(cycles).values({ name: '11th Circle', year: 2027 }).run();
		expect(() => promoteApplicant(db, 2, 1, 'mentee', 'Finance')).toThrow();
	});
});
