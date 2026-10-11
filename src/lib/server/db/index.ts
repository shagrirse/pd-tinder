import Database from 'better-sqlite3';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
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

/** The handle a `db.transaction` callback receives, for helpers that must run inside one. */
export type AppTx = Parameters<Parameters<AppDb['transaction']>[0]>[0];

/**
 * Either the database or a transaction handle. Both extend Drizzle's base SQLite
 * database, so helpers that must work standalone and inside a caller's transaction
 * can take this and open a nested transaction (a savepoint) when they need one.
 */
export type AppExecutor = BaseSQLiteDatabase<'sync', Database.RunResult, typeof schema>;
