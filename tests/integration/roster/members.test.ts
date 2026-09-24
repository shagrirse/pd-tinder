import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../../helpers/db';
import { seedApplicant } from '../../helpers/applicants';
import { applicantPii, cycles, members } from '../../../src/lib/server/db/schema';
import {
	promoteApplicant,
	updateMemberContact,
	upsertMember
} from '../../../src/lib/server/roster/members';
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

describe('upsertMember — contact values', () => {
	it('inserts with null contact when none is provided', () => {
		const { id } = upsertMember(db, 1, MENTOR);
		const row = db.select().from(members).where(eq(members.id, id)).get();
		expect(row).toMatchObject({ telegram: null, linkedin: null });
	});

	it('writes provided contact values on insert and update', () => {
		const { id } = upsertMember(db, 1, {
			...MENTOR,
			telegram: 'adamentor',
			linkedin: 'ada-mentor'
		});
		expect(db.select().from(members).where(eq(members.id, id)).get()).toMatchObject({
			telegram: 'adamentor',
			linkedin: 'ada-mentor'
		});

		upsertMember(db, 1, { ...MENTOR, telegram: 'renamed' });
		expect(db.select().from(members).where(eq(members.id, id)).get()).toMatchObject({
			telegram: 'renamed',
			linkedin: 'ada-mentor'
		});
	});

	it('never clears contact values on re-import with blank columns', () => {
		const { id } = upsertMember(db, 1, { ...MENTOR, telegram: 'adamentor' });
		upsertMember(db, 1, MENTOR);
		expect(db.select().from(members).where(eq(members.id, id)).get()!.telegram).toBe('adamentor');
	});
});

describe('promoteApplicant — contact inheritance', () => {
	it('inherits normalised contact from the application when no override is given', () => {
		const applicantId = seedApplicant(db, {
			cycleId: 1,
			publicRef: 1,
			industry1: 'Finance',
			fullName: 'Ada Fictional',
			email: 'ada@example.com',
			studentId: '01000001'
		});
		db.update(applicantPii)
			.set({ telegram: '@adafictional', linkedinUrl: 'https://www.linkedin.com/in/ada-fictional' })
			.where(eq(applicantPii.applicantId, applicantId))
			.run();

		const { id } = promoteApplicant(db, 1, applicantId, 'mentee', 'Finance');
		expect(db.select().from(members).where(eq(members.id, id)).get()).toMatchObject({
			telegram: 'adafictional',
			linkedin: 'ada-fictional'
		});
	});

	it('lets a CSV override win over the application value', () => {
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

		const { id } = promoteApplicant(db, 1, applicantId, 'mentee', 'Finance', {
			telegram: 'csvhandle',
			linkedin: null
		});
		expect(db.select().from(members).where(eq(members.id, id)).get()).toMatchObject({
			telegram: 'csvhandle',
			linkedin: null
		});
	});
});

describe('updateMemberContact', () => {
	it('normalises and stores edits, and clears on blank', () => {
		const { id } = upsertMember(db, 1, { ...MENTOR, telegram: 'adamentor' });

		updateMemberContact(db, id, {
			telegram: '@renamed',
			linkedin: 'https://www.linkedin.com/in/new-slug'
		});
		expect(db.select().from(members).where(eq(members.id, id)).get()).toMatchObject({
			telegram: 'renamed',
			linkedin: 'new-slug'
		});

		updateMemberContact(db, id, { telegram: '', linkedin: '' });
		expect(db.select().from(members).where(eq(members.id, id)).get()).toMatchObject({
			telegram: null,
			linkedin: null
		});
	});

	it('rejects an invalid handle and an unknown member', () => {
		const { id } = upsertMember(db, 1, MENTOR);
		expect(() => updateMemberContact(db, id, { telegram: 'bad handle!', linkedin: '' })).toThrow(
			/not valid/
		);
		expect(() => updateMemberContact(db, 999, { telegram: '', linkedin: '' })).toThrow(
			/no longer exists/
		);
	});
});
