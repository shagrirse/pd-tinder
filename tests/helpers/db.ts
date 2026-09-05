import { applyMigrations, createDb, type AppDb } from '../../src/lib/server/db';

export function makeTestDb(): AppDb {
	const db = createDb(':memory:');
	applyMigrations(db);
	return db;
}
