import { fail } from '@sveltejs/kit';
import { getDb } from '$lib/server/db/instance';
import { requireAdmin } from '$lib/server/auth/guards';
import { getActiveCycle } from '$lib/server/import/cycle';
import { CANONICAL_INDUSTRIES } from '$lib/server/import/normalize';
import {
	PeopleError,
	createPerson,
	listPeople,
	regenerateInvite,
	setPersonActive
} from '$lib/server/admin/people';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const admin = requireAdmin(locals);
	const db = getDb();
	const cycle = getActiveCycle(db);

	return {
		cycleName: cycle?.name ?? null,
		industries: CANONICAL_INDUSTRIES,
		people: listPeople(db, cycle?.id ?? null),
		currentUserId: admin.id
	};
};

// Both actions, success and failure alike, return the same three keys. That keeps
// the generated ActionData a single shape, so the page can read every field
// without narrowing a union.
type ActionResult = { inviteUrl: string | null; personName: string | null; error: string | null };

const problem = (message: string): ActionResult => ({
	inviteUrl: null,
	personName: null,
	error: message
});

export const actions: Actions = {
	create: async ({ request, locals, url }) => {
		requireAdmin(locals);
		const db = getDb();

		const cycle = getActiveCycle(db);
		if (!cycle) {
			return fail(400, problem('Open a recruitment cycle before adding people.'));
		}

		const form = await request.formData();
		const name = String(form.get('name') ?? '');
		const email = String(form.get('email') ?? '');
		const roleRaw = String(form.get('role') ?? 'reviewer');
		const role = roleRaw === 'admin' ? 'admin' : 'reviewer';
		const industries = form.getAll('industries').map(String);

		try {
			const { token } = createPerson(db, cycle.id, { name, email, role, industries });
			return {
				inviteUrl: new URL(`/invite/${token}`, url.origin).toString(),
				personName: name.trim(),
				error: null
			} satisfies ActionResult;
		} catch (cause) {
			if (cause instanceof PeopleError) return fail(400, problem(cause.message));
			throw cause;
		}
	},

	regenerate: async ({ request, locals, url }) => {
		requireAdmin(locals);
		const db = getDb();

		const form = await request.formData();
		const userId = Number(form.get('userId'));
		if (!Number.isInteger(userId)) return fail(400, problem('Missing person.'));

		try {
			const token = regenerateInvite(db, userId);
			return {
				inviteUrl: new URL(`/invite/${token}`, url.origin).toString(),
				personName: String(form.get('personName') ?? ''),
				error: null
			} satisfies ActionResult;
		} catch (cause) {
			if (cause instanceof PeopleError) return fail(400, problem(cause.message));
			throw cause;
		}
	},

	setActive: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const db = getDb();

		const form = await request.formData();
		const userId = Number(form.get('userId'));
		if (!Number.isInteger(userId)) return fail(400, problem('Missing person.'));

		try {
			setPersonActive(db, admin.id, userId, form.get('active') === 'true');
			return { inviteUrl: null, personName: null, error: null } satisfies ActionResult;
		} catch (cause) {
			if (cause instanceof PeopleError) return fail(400, problem(cause.message));
			throw cause;
		}
	}
};
