import { eq } from 'drizzle-orm';
import type { AppDb } from '../db';
import { cycles } from '../db/schema';

export type CycleResult = { cycleId: number; name: string; year: number };

/**
 * Create the cycle that review will run in, once.
 *
 * Idempotent by design: if a 'reviewing' cycle already exists this writes
 * nothing and returns null, so it can never disturb a cycle in progress.
 * Closing a cycle, and the semantics that carries, is deliberately out of
 * scope here (spec §12) — this function only ever creates.
 */
export function createCycle(db: AppDb, input: { name: string; year: number }): CycleResult | null {
	// Transactional so two concurrent invocations cannot both pass the
	// existence check and mint two reviewing cycles (mirrors bootstrapAdmin).
	return db.transaction(
		(tx) => {
			const existing = tx
				.select({ id: cycles.id })
				.from(cycles)
				.where(eq(cycles.status, 'reviewing'))
				.get();
			if (existing) return null;

			const name = input.name.trim();
			if (name === '') throw new Error('A name is required.');
			if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2100) {
				throw new Error('Year must be an integer between 2000 and 2100.');
			}

			const cycle = tx
				.insert(cycles)
				.values({ name, year: input.year, status: 'reviewing' })
				.returning({ id: cycles.id, name: cycles.name, year: cycles.year })
				.get();

			return { cycleId: cycle.id, name: cycle.name, year: cycle.year };
		},
		{ behavior: 'immediate' }
	);
}
