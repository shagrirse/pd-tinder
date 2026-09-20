import { describe, expect, it } from 'vitest';
import { parse } from 'csv-parse/sync';
import { pairingsCsv } from '../../../src/lib/server/pairing/exportCsv';
import type { PairingRow } from '../../../src/lib/server/pairing/list';

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
		applicantId: null
	},
	mentee: {
		id: 2,
		fullName: 'Jordan Mentee',
		email: 'jordan@example.com',
		industry: 'Finance',
		studentId: '01000002',
		applicantId: null
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
});
