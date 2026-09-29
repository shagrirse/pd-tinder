import { fail } from '@sveltejs/kit';
import { getDb } from '$lib/server/db/instance';
import { requireAdmin } from '$lib/server/auth/guards';
import { getActiveCycle } from '$lib/server/import/cycle';
import { listMemberRows } from '$lib/server/members/rows';
import { getLatestBaseline } from '$lib/server/pairing/baseline';
import { closeForm, getFormStatus, reopenForm } from '$lib/server/pairing/form';
import { OverrideError, overridePair } from '$lib/server/pairing/override';
import { runReconciliation } from '$lib/server/pairing/run';
import { updateMemberContact } from '$lib/server/roster/members';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);
	const db = getDb();
	const cycle = getActiveCycle(db);
	if (!cycle) {
		return { cycle: null, rows: [], status: 'not_opened' as const, baseline: null };
	}
	return {
		cycle,
		rows: listMemberRows(db, cycle.id),
		status: getFormStatus(db, cycle.id),
		baseline: getLatestBaseline(db, cycle.id)
	};
};

type ActionResult = { error: string | null; updateError: string | null };
const OK: ActionResult = { error: null, updateError: null };
const problem = (message: string): ActionResult => ({ error: message, updateError: null });

const OVERRIDE_ERROR_MESSAGES: Record<OverrideError['code'], string> = {
	not_found: 'Choose a mentor and a mentee from the lists.',
	reason_required: 'An override needs a reason.',
	role_mismatch: 'Choose one mentor and one mentee.',
	wrong_cycle: 'Both members must belong to the active cycle.',
	no_baseline:
		'Close the preference form first. Overrides are measured against the baseline it saves.'
};

export const actions: Actions = {
	close: async ({ locals }) => {
		const user = requireAdmin(locals);
		const db = getDb();
		const cycle = getActiveCycle(db);
		if (!cycle) return fail(400, problem('No active cycle.'));
		if (closeForm(db, cycle.id, user.id) === null) {
			return fail(400, problem('The form is not open, so there is nothing to close.'));
		}
		return OK;
	},

	reopen: async ({ locals }) => {
		requireAdmin(locals);
		const db = getDb();
		const cycle = getActiveCycle(db);
		if (!cycle) return fail(400, problem('No active cycle.'));
		reopenForm(db, cycle.id);
		return OK;
	},

	reconcile: async ({ locals }) => {
		requireAdmin(locals);
		const db = getDb();
		const cycle = getActiveCycle(db);
		if (!cycle) return fail(400, problem('No active cycle.'));
		// Choices are frozen while closed, so the live pairs already match the
		// saved baseline plus overrides. A rerun is only useful as a preview.
		if (getFormStatus(db, cycle.id) === 'closed') {
			return fail(
				400,
				problem(
					'The form is closed, so the pairings already reflect the saved baseline. Reopen the form to rerun reconciliation.'
				)
			);
		}
		runReconciliation(db, cycle.id);
		return OK;
	},

	override: async ({ request, locals }) => {
		const user = requireAdmin(locals);
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
			overridePair(db, cycle.id, mentorMemberId, menteeMemberId, reason, user.id);
		} catch (cause) {
			if (cause instanceof OverrideError) {
				return fail(400, problem(OVERRIDE_ERROR_MESSAGES[cause.code]));
			}
			throw cause;
		}
		return OK;
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
		return OK;
	}
};
