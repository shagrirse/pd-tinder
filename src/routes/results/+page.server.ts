import { getDb } from '$lib/server/db/instance';
import { requireAdmin } from '$lib/server/auth/guards';
import { getActiveCycle } from '$lib/server/import/cycle';
import { rankCycle } from '$lib/server/results/rank';
import { getIndustryProgress } from '$lib/server/results/progress';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);
	const db = getDb();

	const cycle = getActiveCycle(db);
	if (!cycle) return { cycleName: null, industries: [], progress: [] };

	return {
		cycleName: cycle.name,
		industries: rankCycle(db, cycle.id),
		progress: getIndustryProgress(db, cycle.id)
	};
};
