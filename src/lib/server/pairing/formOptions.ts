import { and, eq } from 'drizzle-orm';
import type { AppDb } from '../db';
import { members } from '../db/schema';
import { duplicateNames, type ResponseRole } from './responseNormalize';

/**
 * The names to paste into a form dropdown: active members of one role, exactly as
 * the roster stores them, so what a respondent picks is what the importer looks up.
 */
export function listFormOptions(
	db: AppDb,
	cycleId: number,
	role: ResponseRole
): { names: string[]; duplicates: { name: string; count: number }[] } {
	const names = db
		.select({ fullName: members.fullName })
		.from(members)
		.where(and(eq(members.cycleId, cycleId), eq(members.role, role), eq(members.active, true)))
		.all()
		.map((r) => r.fullName)
		.sort((a, b) => a.localeCompare(b));

	return { names, duplicates: duplicateNames(names) };
}
