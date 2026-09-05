import { getDb } from '$lib/server/db/instance';
import { requireAssignment, requireUser } from '$lib/server/auth/guards';
import { getActiveCycle } from '$lib/server/import/cycle';
import { listReviewedByUser } from '$lib/server/review/reviewed';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals);
	const db = getDb();

	const cycle = getActiveCycle(db);
	if (!cycle) return { items: [] };

	requireAssignment(db, user, cycle.id);
	return { items: listReviewedByUser(db, user.id, cycle.id) };
};
