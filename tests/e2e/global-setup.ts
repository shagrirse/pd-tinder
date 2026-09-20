import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { applyMigrations, createDb } from '../../src/lib/server/db';
import { assignments, cycles, members, users } from '../../src/lib/server/db/schema';
import { hashPassword } from '../../src/lib/server/auth/password';
import { DEFAULT_COLUMN_MAPPING } from '../../src/lib/server/import/columns';
import { parseCsv } from '../../src/lib/server/import/parse';
import { commitImport } from '../../src/lib/server/import/commit';
import { generateMemberTokens } from '../../src/lib/server/roster/tokens';

export const E2E_DB = '.e2e/pd-tinder.db';
export const MEMBER_TOKENS_FILE = '.e2e/member-tokens.json';

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

	// Seeded directly (not via the roster CSV import) so the preferences e2e
	// spec doesn't depend on another spec file having run first. Two
	// industries, so the fixture also exercises the roster grouping on the
	// preference page.
	db.insert(members)
		.values([
			{ cycleId: 1, role: 'mentor', fullName: 'Priya Mentor', email: 'priya-mentor@example.com', industry: 'Finance' },
			{ cycleId: 1, role: 'mentor', fullName: 'Sam Mentor', email: 'sam-mentor@example.com', industry: 'Finance' },
			{ cycleId: 1, role: 'mentor', fullName: 'Alex Mentor', email: 'alex-mentor@example.com', industry: 'Tech' },
			{ cycleId: 1, role: 'mentee', fullName: 'Jordan Mentee', email: 'jordan-mentee@example.com', industry: 'Finance' }
		])
		.run();

	// Tokens are hashed at rest (see memberToken.ts) and can't be recovered
	// from the DB afterwards, so the raw values are handed to the e2e specs
	// this way, the same way generateMemberTokens hands them to the admin
	// roster page for CSV export.
	writeFileSync(MEMBER_TOKENS_FILE, JSON.stringify(generateMemberTokens(db, 1)));
}
