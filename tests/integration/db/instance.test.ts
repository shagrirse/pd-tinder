import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDb, setDbForTesting } from '../../../src/lib/server/db/instance';
import { cycles } from '../../../src/lib/server/db/schema';

let dir: string;
let previousUrl: string | undefined;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'pdt-instance-'));
	previousUrl = process.env.DATABASE_URL;
	// Drop any connection a previous test cached, so getDb() reopens.
	setDbForTesting(null);
});

afterEach(() => {
	setDbForTesting(null);
	if (previousUrl === undefined) delete process.env.DATABASE_URL;
	else process.env.DATABASE_URL = previousUrl;
	rmSync(dir, { recursive: true, force: true });
});

describe('getDb', () => {
	it('applies migrations to a database that has never been opened', () => {
		process.env.DATABASE_URL = join(dir, 'fresh.db');

		// Without migrations this throws "no such table: cycles" — which is exactly
		// how a fresh deployment fails today.
		expect(getDb().select().from(cycles).all()).toEqual([]);
	});

	it('opens the database once and reuses the connection', () => {
		process.env.DATABASE_URL = join(dir, 'cached.db');
		expect(getDb()).toBe(getDb());
	});

	it('leaves existing data intact when the database is reopened', () => {
		process.env.DATABASE_URL = join(dir, 'reopen.db');
		getDb().insert(cycles).values({ name: 'Kept', year: 2026 }).run();

		setDbForTesting(null);

		// Re-running migrations against an already-migrated database must be a no-op.
		expect(getDb().select().from(cycles).all()[0].name).toBe('Kept');
	});
});
