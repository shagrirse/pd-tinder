import { fail } from '@sveltejs/kit';
import { getDb } from '$lib/server/db/instance';
import { requireAdmin } from '$lib/server/auth/guards';
import { getActiveCycle } from '$lib/server/import/cycle';
import { closeForm, getFormStatus, reopenForm, submissionStatus } from '$lib/server/pairing/form';
import { computeResidual, listPairings } from '$lib/server/pairing/list';
import { runReconciliation } from '$lib/server/pairing/run';
import { OverrideError, overridePair } from '$lib/server/pairing/override';
import { listActiveRoster } from '$lib/server/roster/list';
import { updateMemberContact } from '$lib/server/roster/members';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);
	const db = getDb();
	const cycle = getActiveCycle(db);

	if (!cycle) {
		return {
			cycle: null,
			status: 'not_opened' as const,
			submissions: { submitted: [], notSubmitted: [] },
			pairings: [],
			residual: { unpaired: [], gotNoChoice: [] },
			mentors: [],
			mentees: []
		};
	}

	return {
		cycle,
		status: getFormStatus(db, cycle.id),
		submissions: submissionStatus(db, cycle.id),
		pairings: listPairings(db, cycle.id),
		residual: computeResidual(db, cycle.id),
		mentors: listActiveRoster(db, cycle.id, 'mentor'),
		mentees: listActiveRoster(db, cycle.id, 'mentee')
	};
};

type ActionResult = { error: string | null; updateError: string | null };
const problem = (message: string): ActionResult => ({ error: message, updateError: null });

const OVERRIDE_ERROR_MESSAGES: Record<OverrideError['code'], string> = {
	not_found: 'Choose a mentor and a mentee from the lists above.',
	reason_required: 'An override needs a reason.',
	role_mismatch: 'Choose one mentor and one mentee.',
	wrong_cycle: 'Both members must belong to the active cycle.'
};

export const actions: Actions = {
	close: async ({ locals }) => {
		requireAdmin(locals);
		const db = getDb();
		const cycle = getActiveCycle(db);
		if (!cycle) return fail(400, problem('No active cycle.'));
		closeForm(db, cycle.id);
		return { error: null, updateError: null } satisfies ActionResult;
	},

	reopen: async ({ locals }) => {
		requireAdmin(locals);
		const db = getDb();
		const cycle = getActiveCycle(db);
		if (!cycle) return fail(400, problem('No active cycle.'));
		reopenForm(db, cycle.id);
		return { error: null, updateError: null } satisfies ActionResult;
	},

	reconcile: async ({ locals }) => {
		requireAdmin(locals);
		const db = getDb();
		const cycle = getActiveCycle(db);
		if (!cycle) return fail(400, problem('No active cycle.'));
		runReconciliation(db, cycle.id);
		return { error: null, updateError: null } satisfies ActionResult;
	},

	override: async ({ request, locals }) => {
		requireAdmin(locals);
		const db = getDb();
		const cycle = getActiveCycle(db);
		if (!cycle) return fail(400, problem('No active cycle.'));

		const form = await request.formData();
		const mentorMemberId = Number(form.get('mentorMemberId'));
		const menteeMemberId = Number(form.get('menteeMemberId'));
		const reason = String(form.get('reason') ?? '');

		if (!Number.isInteger(mentorMemberId) || !Number.isInteger(menteeMemberId)) {
			return fail(400, problem('Choose a mentor and a mentee.'));
		}

		try {
			overridePair(db, cycle.id, mentorMemberId, menteeMemberId, reason);
		} catch (cause) {
			if (cause instanceof OverrideError) {
				return fail(400, problem(OVERRIDE_ERROR_MESSAGES[cause.code]));
			}
			throw cause;
		}

		return { error: null, updateError: null } satisfies ActionResult;
	},

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
