import { error, fail } from '@sveltejs/kit';
import { getDb } from '$lib/server/db/instance';
import { resolveMemberToken } from '$lib/server/auth/memberToken';
import { listActiveRoster } from '$lib/server/roster/list';
import {
	getPreferences,
	setPreferences,
	PreferenceError,
	type ChoiceInput
} from '$lib/server/pairing/preferences';
import type { Actions, PageServerLoad } from './$types';

const OPPOSITE_ROLE = { mentor: 'mentee', mentee: 'mentor' } as const;

const PREFERENCE_ERROR_MESSAGES: Record<PreferenceError['code'], string> = {
	incomplete: 'Choose someone for all three ranks.',
	duplicate_choice: 'Each of your three choices must be a different person.',
	same_role: 'Choices must come from the roster shown above.',
	wrong_cycle: 'That choice is no longer available.',
	not_found: 'Choose someone from the roster for each rank.',
	inactive: 'That choice is no longer available.'
};

function resolveOrNotFound(token: string) {
	const db = getDb();
	const member = resolveMemberToken(db, token);
	if (!member) throw error(404, 'This link is invalid or has expired.');
	return { db, member };
}

export const load: PageServerLoad = async ({ params }) => {
	const { db, member } = resolveOrNotFound(params.token);

	return {
		member,
		roster: listActiveRoster(db, member.cycleId, OPPOSITE_ROLE[member.role]),
		existing: getPreferences(db, member.id)
	};
};

function parseChoices(form: FormData): ChoiceInput[] {
	return [1, 2, 3].map((rank) => ({
		rank: rank as 1 | 2 | 3,
		choiceMemberId: Number(form.get(`choice${rank}`)),
		reason: String(form.get(`reason${rank}`) ?? '').trim()
	}));
}

export const actions: Actions = {
	default: async ({ request, params }) => {
		const { db, member } = resolveOrNotFound(params.token);

		const choices = parseChoices(await request.formData());
		if (choices.some((c) => !c.reason)) {
			return fail(400, { error: 'Give a reason for each choice.', choices });
		}

		try {
			setPreferences(db, member.id, choices);
		} catch (err) {
			if (err instanceof PreferenceError) {
				return fail(400, { error: PREFERENCE_ERROR_MESSAGES[err.code], choices });
			}
			throw err;
		}

		return { saved: true, choices };
	}
};
