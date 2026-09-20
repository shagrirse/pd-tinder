import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db/instance';
import { requireAdmin } from '$lib/server/auth/guards';
import { listCycles } from '$lib/server/import/cycle';
import { generateMemberTokens } from '$lib/server/roster/tokens';
import { memberTokensCsv } from '$lib/server/roster/tokensCsv';
import type { RequestHandler } from './$types';

// POST, not GET: unlike /results/export this generates fresh tokens as a
// side effect (retiring any still-live one per member — see
// generateMemberTokens), so it must not be safe to prefetch or re-request
// idly the way a plain export is.
export const POST: RequestHandler = async ({ request, locals, url }) => {
	requireAdmin(locals);
	const db = getDb();

	const form = await request.formData();
	const cycleId = Number(form.get('cycleId'));
	const cycle = listCycles(db).find((c) => c.id === cycleId);
	if (!cycle) throw error(400, 'That cycle no longer exists.');

	const rows = generateMemberTokens(db, cycleId);
	const filename = `pd-tinder-${cycle.name.replace(/\W+/g, '-').toLowerCase()}-member-links.csv`;

	return new Response(memberTokensCsv(rows, url.origin), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="${filename}"`
		}
	});
};
