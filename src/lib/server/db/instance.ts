import { applyMigrations, createDb, type AppDb } from './index';

let cached: AppDb | null = null;

export function getDb(): AppDb {
	if (!cached) {
		const db = createDb(process.env.DATABASE_URL ?? 'data/pd-tinder.db');

		// Migrating here rather than in a deploy step means no deployment can forget
		// it, and operational scripts get a migrated database too. Re-running against
		// an already-migrated database is a no-op: drizzle records what it applied.
		applyMigrations(db);
		cached = db;
	}
	return cached;
}

/** Test-only: point every route handler at an isolated database, or pass null to reopen. */
export function setDbForTesting(db: AppDb | null): void {
	cached = db;
}
