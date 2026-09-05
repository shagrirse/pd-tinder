import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

export type AppDb = ReturnType<typeof createDb>;

export function createDb(url: string) {
	const sqlite = new Database(url);
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	return drizzle(sqlite, { schema });
}

export function applyMigrations(db: AppDb): void {
	migrate(db, { migrationsFolder: 'drizzle' });
}
