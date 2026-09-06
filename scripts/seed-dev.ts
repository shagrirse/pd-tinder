/**
 * Local dev seed script. Not part of the shipped app — the admin surface
 * that would normally create cycles/users/imports isn't built yet,
 * so this stands in for it during manual testing.
 *
 * Usage:
 *   npx tsx scripts/seed-dev.ts                        # seeds with the invented test fixture
 *   npx tsx scripts/seed-dev.ts --csv tmc.csv           # seeds with a real export
 *   npx tsx scripts/seed-dev.ts --db data/other.db      # custom DB path
 */
import { readFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { applyMigrations, createDb } from '../src/lib/server/db';
import { assignments, cycles, users } from '../src/lib/server/db/schema';
import { hashPassword } from '../src/lib/server/auth/password';
import { DEFAULT_COLUMN_MAPPING } from '../src/lib/server/import/columns';
import { parseCsv } from '../src/lib/server/import/parse';
import { commitImport } from '../src/lib/server/import/commit';
import { validateImport } from '../src/lib/server/import/validate';
import { CANONICAL_INDUSTRIES } from '../src/lib/server/import/normalize';

function argValue(flag: string, fallback: string): string {
	const index = process.argv.indexOf(flag);
	return index === -1 ? fallback : process.argv[index + 1];
}

const dbPath = argValue('--db', process.env.DATABASE_URL ?? 'data/pd-tinder.db');
const csvPath = argValue('--csv', 'tests/fixtures/applicants-sample.csv');

const ADMIN = { name: 'Admin', email: 'admin@example.com', password: 'admin-password-1' };
const REVIEWER = { name: 'Reviewer', email: 'reviewer@example.com', password: 'reviewer-password-1' };

async function main() {
	mkdirSync(dirname(dbPath), { recursive: true });
	if (existsSync(dbPath)) rmSync(dbPath);
	for (const ext of ['-wal', '-shm']) {
		if (existsSync(dbPath + ext)) rmSync(dbPath + ext);
	}

	const db = createDb(dbPath);
	applyMigrations(db);

	const parsed = parseCsv(readFileSync(csvPath, 'utf8'));
	const report = validateImport(parsed, DEFAULT_COLUMN_MAPPING);
	if (report.blocking.length > 0) {
		console.error(`Import blocked by ${report.blocking.length} error(s):`);
		for (const message of report.blocking) console.error(`  - ${message}`);
		process.exit(1);
	}

	const cycleId = db
		.insert(cycles)
		.values({ name: 'Local Dev Cycle', year: new Date().getFullYear(), status: 'reviewing' })
		.returning({ id: cycles.id })
		.get().id;

	const { inserted, updated } = commitImport(db, cycleId, parsed, DEFAULT_COLUMN_MAPPING);

	const adminId = db
		.insert(users)
		.values({
			name: ADMIN.name,
			email: ADMIN.email,
			passwordHash: await hashPassword(ADMIN.password),
			role: 'admin'
		})
		.returning({ id: users.id })
		.get().id;

	const reviewerId = db
		.insert(users)
		.values({
			name: REVIEWER.name,
			email: REVIEWER.email,
			passwordHash: await hashPassword(REVIEWER.password),
			role: 'reviewer'
		})
		.returning({ id: users.id })
		.get().id;

	// Assign the reviewer to every industry so the whole pool is reachable while testing.
	db.insert(assignments)
		.values(CANONICAL_INDUSTRIES.map((industry) => ({ userId: reviewerId, cycleId, industry })))
		.run();

	console.log(`Seeded ${dbPath} from ${csvPath}`);
	console.log(`  Cycle: "Local Dev Cycle" (${inserted} inserted, ${updated} updated)`);
	console.log(`  Industry counts: ${JSON.stringify(report.industryCounts)}`);
	if (report.duplicateStudentIds.length > 0) {
		console.log(`  Warning: ${report.duplicateStudentIds.length} duplicate student ID(s), later row won`);
	}
	console.log('');
	console.log('Login credentials:');
	console.log(`  Admin:    ${ADMIN.email} / ${ADMIN.password}`);
	console.log(`  Reviewer: ${REVIEWER.email} / ${REVIEWER.password}`);
}

main();
