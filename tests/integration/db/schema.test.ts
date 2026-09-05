import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../../helpers/db';
import { cycles, applicants, applicantPii } from '../../../src/lib/server/db/schema';

describe('schema', () => {
	it('stores and reads back a cycle', () => {
		const db = makeTestDb();
		db.insert(cycles).values({ name: 'Mentee Recruitment 2026', year: 2026 }).run();
		const rows = db.select().from(cycles).all();
		expect(rows).toHaveLength(1);
		expect(rows[0].status).toBe('draft');
	});

	it('keeps PII in a table separate from applicants', () => {
		const db = makeTestDb();
		db.insert(cycles).values({ name: 'C', year: 2026 }).run();
		db.insert(applicants)
			.values({ cycleId: 1, publicRef: 1, industry1: 'Finance', industry2: 'Tech', faculty: 'LKCSB', gender: 'Male', priorMentee: false, linkedinStatus: 'valid' })
			.run();
		db.insert(applicantPii)
			.values({ applicantId: 1, fullName: 'Test Person', email: 't@example.com', studentId: '01234856' })
			.run();

		const applicantColumns = Object.keys(db.select().from(applicants).all()[0]);
		expect(applicantColumns).not.toContain('fullName');
		expect(applicantColumns).not.toContain('email');

		const pii = db.select().from(applicantPii).where(eq(applicantPii.applicantId, 1)).all();
		expect(pii[0].fullName).toBe('Test Person');
	});
});
