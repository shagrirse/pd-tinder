import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '../../helpers/db';
import { cycles, members } from '../../../src/lib/server/db/schema';
import { PII_FIELD_NAMES } from '../../../src/lib/server/review/blind';
import { setPreferences } from '../../../src/lib/server/pairing/preferences';
import { runReconciliation } from '../../../src/lib/server/pairing/run';
import type { AppDb } from '../../../src/lib/server/db';

const PAIRING_DIR = 'src/lib/server/pairing';

describe('the pairing module never touches the selection domain', () => {
	it('references neither applicantPii nor applicant_pii in any source file', () => {
		const files = readdirSync(PAIRING_DIR, { recursive: true }).filter(
			(f): f is string => typeof f === 'string' && f.endsWith('.ts')
		);
		expect(files.length).toBeGreaterThan(0);
		for (const file of files) {
			const source = readFileSync(join(PAIRING_DIR, file), 'utf8');
			expect(source, `${file} must not reach into applicant_pii`).not.toContain('applicantPii');
			expect(source, `${file} must not reach into applicant_pii`).not.toContain('applicant_pii');
		}
	});
});

describe('a reconciliation result', () => {
	let db: AppDb;

	beforeEach(() => {
		db = makeTestDb();
		db.insert(cycles).values({ name: '10th Circle', year: 2026 }).run();
		const mentor = db
			.insert(members)
			.values({ cycleId: 1, role: 'mentor', fullName: 'Mentor One', email: 'm1@example.com' })
			.returning({ id: members.id })
			.get().id;
		const mentees = [1, 2, 3].map(
			(n) =>
				db
					.insert(members)
					.values({ cycleId: 1, role: 'mentee', fullName: `Mentee ${n}`, email: `e${n}@example.com` })
					.returning({ id: members.id })
					.get().id
		);
		setPreferences(
			db,
			mentor,
			mentees.map((choiceMemberId, i) => ({
				rank: (i + 1) as 1 | 2 | 3,
				choiceMemberId,
				reason: 'because'
			}))
		);
	});

	it('exposes member ids and methods, and no PII property names', () => {
		const result = runReconciliation(db, 1);
		const serialised = JSON.stringify(result);
		for (const field of PII_FIELD_NAMES) {
			expect(serialised, `${field} must not appear in a reconciliation result`).not.toContain(field);
		}
		expect(result.pairs.length).toBeGreaterThan(0);
	});
});
