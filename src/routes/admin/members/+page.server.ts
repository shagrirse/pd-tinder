import { fail } from '@sveltejs/kit';
import { getDb } from '$lib/server/db/instance';
import { requireAdmin } from '$lib/server/auth/guards';
import { getActiveCycle } from '$lib/server/import/cycle';
import { listMemberRows } from '$lib/server/members/rows';
import { updateMemberContact } from '$lib/server/roster/members';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);
	const db = getDb();
	const cycle = getActiveCycle(db);
	if (!cycle) return { cycle: null, rows: [] };
	return { cycle, rows: listMemberRows(db, cycle.id) };
};

type ActionResult = { error: string | null; updateError: string | null };

export const actions: Actions = {
	updateMember: async ({ request, locals }) => {
		requireAdmin(locals);
		const db = getDb();
		const form = await request.formData();

		const memberId = Number(form.get('memberId'));
		if (!Number.isInteger(memberId)) {
			return fail(400, { error: null, updateError: 'Choose a member first.' });
		}

		try {
			updateMemberContact(db, memberId, {
				telegram: String(form.get('telegram') ?? ''),
				linkedin: String(form.get('linkedin') ?? '')
			});
		} catch (cause) {
			if (cause instanceof Error) {
				return fail(400, { error: null, updateError: cause.message });
			}
			throw cause;
		}

		return { error: null, updateError: null } satisfies ActionResult;
	}
};
