import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { applyMigrations, createDb } from '../../src/lib/server/db';
import { assignments, cycles, users } from '../../src/lib/server/db/schema';
import { hashPassword } from '../../src/lib/server/auth/password';
import { DEFAULT_COLUMN_MAPPING } from '../../src/lib/server/import/columns';
import { parseCsv } from '../../src/lib/server/import/parse';
import { commitImport } from '../../src/lib/server/import/commit';

export const E2E_DB = '.e2e/pd-tinder.db';

export default async function globalSetup(): Promise<void> {
	rmSync('.e2e', { recursive: true, force: true });
	mkdirSync('.e2e', { recursive: true });

	const db = createDb(E2E_DB);
	applyMigrations(db);

	db.insert(cycles)
		.values({ name: 'Mentee Recruitment 2026', year: 2026, status: 'reviewing' })
		.run();

	commitImport(
		db,
		1,
		parseCsv(readFileSync('tests/fixtures/applicants-sample.csv', 'utf8')),
		DEFAULT_COLUMN_MAPPING
	);

	db.insert(users)
		.values([
			{
				name: 'Reviewer One',
				email: 'reviewer@example.com',
				passwordHash: await hashPassword('reviewer-password-1'),
				role: 'reviewer'
			},
			{
				name: 'Admin One',
				email: 'admin@example.com',
				passwordHash: await hashPassword('admin-password-1'),
				role: 'admin'
			}
		])
		.run();

	db.insert(assignments)
		.values([
			{ userId: 1, cycleId: 1, industry: 'Finance' },
			{ userId: 2, cycleId: 1, industry: 'Finance' }
		])
		.run();
}
