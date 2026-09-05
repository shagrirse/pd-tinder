import { error, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { AppDb } from '../db';
import { assignments } from '../db/schema';
import type { SessionUser } from './session';

export function requireUser(locals: App.Locals): SessionUser {
	if (!locals.user) throw redirect(303, '/login');
	return locals.user;
}

export function requireAdmin(locals: App.Locals): SessionUser {
	const user = requireUser(locals);
	if (user.role !== 'admin') throw error(403, 'Admins only.');
	return user;
}

export function requireAssignment(db: AppDb, user: SessionUser, cycleId: number): string[] {
	const rows = db
		.select({ industry: assignments.industry })
		.from(assignments)
		.where(and(eq(assignments.userId, user.id), eq(assignments.cycleId, cycleId)))
		.all();

	if (rows.length === 0) throw error(403, 'You have no industry assigned for this cycle.');
	return rows.map((r) => r.industry);
}
