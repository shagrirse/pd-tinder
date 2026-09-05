import { desc, eq } from 'drizzle-orm';
import type { AppDb } from '../db';
import { cycles } from '../db/schema';

export function getActiveCycle(db: AppDb): { id: number; name: string } | null {
	const row = db
		.select({ id: cycles.id, name: cycles.name })
		.from(cycles)
		.where(eq(cycles.status, 'reviewing'))
		.orderBy(desc(cycles.year))
		.get();
	return row ?? null;
}

export type CycleSummary = {
	id: number;
	name: string;
	year: number;
	status: 'draft' | 'reviewing' | 'closed';
};

/**
 * Every cycle, whatever its status. The import wizard needs this because import
 * normally happens while a cycle is still `draft`, which `getActiveCycle` — which
 * answers "what is open for review" — deliberately cannot see.
 */
export function listCycles(db: AppDb): CycleSummary[] {
	return db
		.select({
			id: cycles.id,
			name: cycles.name,
			year: cycles.year,
			status: cycles.status
		})
		.from(cycles)
		.orderBy(desc(cycles.year), desc(cycles.id))
		.all();
}
