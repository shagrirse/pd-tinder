import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db/instance';
import { requireAdmin } from '$lib/server/auth/guards';
import { getActiveCycle } from '$lib/server/import/cycle';
import { baselineRecords } from '$lib/server/pairing/records';
import { baselineCsv } from '$lib/server/pairing/exportCsv';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	requireAdmin(locals);
	const db = getDb();

	const cycle = getActiveCycle(db);
	if (!cycle) throw error(404, 'No cycle is open.');

	const records = baselineRecords(db, cycle.id);
	if (!records) throw error(404, 'No baseline yet. Close the preference form to save one.');

	const filename = `pd-tinder-${cycle.name.replace(/\W+/g, '-').toLowerCase()}-baseline.csv`;
	return new Response(baselineCsv(records), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="${filename}"`
		}
	});
};
