import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db/instance';
import { requireAdmin } from '$lib/server/auth/guards';
import { getActiveCycle } from '$lib/server/import/cycle';
import { listFormOptions } from '$lib/server/pairing/formOptions';
import type { RequestHandler } from './$types';

// The role in the path is the role of the people listed: "mentee" is the list a
// mentor chooses from, "mentor" the list a mentee chooses from.
export const GET: RequestHandler = async ({ params, locals }) => {
	requireAdmin(locals);
	const role = params.role;
	if (role !== 'mentee' && role !== 'mentor') throw error(404, 'Not found.');

	const db = getDb();
	const cycle = getActiveCycle(db);
	if (!cycle) throw error(404, 'No cycle is open.');

	const { names } = listFormOptions(db, cycle.id, role);
	return new Response(names.length > 0 ? `${names.join('\n')}\n` : '', {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'content-disposition': `attachment; filename="${role}-names.txt"`
		}
	});
};
