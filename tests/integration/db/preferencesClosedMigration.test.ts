import { readdirSync, readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { makeTestDb } from '../../helpers/db';
import { cycles, memberTokens, members } from '../../../src/lib/server/db/schema';
import type { AppDb } from '../../../src/lib/server/db';

let db: AppDb;

/** The backfill is data-only, so it is read back out of the generated migration and re-run. */
function backfillStatement(): string {
	const text = readdirSync('drizzle')
		.filter((f) => f.endsWith('.sql'))
		.map((f) => readFileSync(`drizzle/${f}`, 'utf8'))
		.find((t) => t.includes('preferences_closed_at') && t.includes('UPDATE'));
	if (!text) throw new Error('No migration contains the preferences_closed_at backfill');
	const statement = text
		.split('--> statement-breakpoint')
		.map((s) => s.trim())
		.find((s) => s.startsWith('UPDATE'));
	if (!statement) throw new Error('The backfill UPDATE statement was not found');
	return statement;
}

function addCycle(name: string): number {
	return db.insert(cycles).values({ name, year: 2026 }).returning({ id: cycles.id }).get().id;
}

function addMember(cycleId: number, email: string): number {
	return db
		.insert(members)
		.values({ cycleId, role: 'mentee', fullName: `Fixture ${email}`, email })
		.returning({ id: members.id })
		.get().id;
}

const past = () => new Date(Date.now() - 60_000);
const future = () => new Date(Date.now() + 60_000);

function addToken(memberId: number, hash: string, expiresAt: Date) {
	db.insert(memberTokens).values({ memberId, tokenHash: hash, expiresAt }).run();
}

function closedAt(cycleId: number) {
	return db
		.select({ closedAt: cycles.preferencesClosedAt })
		.from(cycles)
		.where(eq(cycles.id, cycleId))
		.get()!.closedAt;
}

beforeEach(() => {
	db = makeTestDb();
});

describe('preferences_closed_at backfill', () => {
	it('closes a cycle whose members all have only expired tokens', () => {
		const c = addCycle('all expired');
		addToken(addMember(c, 'a@example.com'), 'h1', past());
		addToken(addMember(c, 'b@example.com'), 'h2', past());

		db.run(sql.raw(backfillStatement()));

		expect(closedAt(c)).not.toBeNull();
	});

	it('leaves a cycle open when any member still has a live latest token', () => {
		const c = addCycle('one live');
		addToken(addMember(c, 'a@example.com'), 'h1', past());
		addToken(addMember(c, 'b@example.com'), 'h2', future());

		db.run(sql.raw(backfillStatement()));

		expect(closedAt(c)).toBeNull();
	});

	it('leaves a cycle open when no token was ever issued', () => {
		const c = addCycle('no tokens');
		addMember(c, 'a@example.com');

		db.run(sql.raw(backfillStatement()));

		expect(closedAt(c)).toBeNull();
	});

	it('judges each member by their newest token, not an older one', () => {
		const c = addCycle('regenerated');
		const m = addMember(c, 'a@example.com');
		addToken(m, 'old-live', future());
		addToken(m, 'newest-expired', past());

		db.run(sql.raw(backfillStatement()));

		expect(closedAt(c)).not.toBeNull();
	});
});
