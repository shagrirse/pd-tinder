import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db/instance';
import { requireAdmin } from '$lib/server/auth/guards';
import { getActiveCycle } from '$lib/server/import/cycle';
import { exportCycleCsv } from '$lib/server/results/export';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	requireAdmin(locals);
	const db = getDb();

	const cycle = getActiveCycle(db);
	if (!cycle) throw error(404, 'No cycle is open.');

	const filename = `pd-tinder-${cycle.name.replace(/\W+/g, '-').toLowerCase()}.csv`;
	return new Response(exportCycleCsv(db, cycle.id), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="${filename}"`
		}
	});
};
