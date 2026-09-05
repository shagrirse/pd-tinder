/**
 * LOCAL REHEARSAL ONLY. Creates the smoke admin with a known password and the
 * reviewing cycle, so the smoke spec can run against a local compose stack.
 *
 * Never run against the deployed instance: there the administrator must come
 * from the passwordless bootstrap-admin flow, which is exactly what the live
 * smoke test verifies.
 *
 * Runs inside the app container (which has tsx and this file):
 *   docker compose -f deploy/compose.yaml -f deploy/compose.local.yml \
 *     exec app npx tsx scripts/smoke/local-seed.ts
 */
import { applyMigrations, createDb } from '../../src/lib/server/db';
import { users } from '../../src/lib/server/db/schema';
import { hashPassword } from '../../src/lib/server/auth/password';
import { createCycle } from '../../src/lib/server/admin/cycle';

async function main() {
	const db = createDb(process.env.DATABASE_URL ?? '/data/pd-tinder.db');
	applyMigrations(db);

	const email = process.env.SMOKE_ADMIN_EMAIL ?? 'admin@example.com';
	// No default password: this file ships in the production image, and a
	// default-credential generator there is a footgun. The rehearsal passes
	// the password explicitly with -e.
	const password = process.env.SMOKE_ADMIN_PASSWORD;
	if (!password) {
		throw new Error('SMOKE_ADMIN_PASSWORD is required (rehearsal: pass it with -e).');
	}

	if (!db.select({ id: users.id }).from(users).get()) {
		db.insert(users)
			.values({
				name: 'Smoke Admin',
				email,
				passwordHash: await hashPassword(password),
				role: 'admin'
			})
			.run();
	}

	if (createCycle(db, { name: 'Smoke Rehearsal', year: 2026 }) === null) {
		console.log('A reviewing cycle already exists — left as is.');
	}

	console.log(`Local smoke environment ready: admin <${email}>, cycle present.`);
}

await main();
