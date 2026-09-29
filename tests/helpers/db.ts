import { applyMigrations, createDb, type AppDb } from '../../src/lib/server/db';
import { users } from '../../src/lib/server/db/schema';

export function makeTestDb(): AppDb {
	const db = createDb(':memory:');
	applyMigrations(db);
	return db;
}

/** An admin user to act as the author of baselines and overrides. */
export function seedAdmin(db: AppDb): number {
	return db
		.insert(users)
		.values({ name: 'Test Admin', email: 'admin@example.com', role: 'admin' })
		.returning({ id: users.id })
		.get().id;
}
