import { fail } from '@sveltejs/kit';
import { getDb } from '$lib/server/db/instance';
import { requireAdmin } from '$lib/server/auth/guards';
import { getActiveCycle } from '$lib/server/import/cycle';
import { parseCsv } from '$lib/server/import/parse';
import { getFormStatus } from '$lib/server/pairing/form';
import { listFormOptions } from '$lib/server/pairing/formOptions';
import {
	ResponsesError,
	commitResponses,
	previewResponses,
	type ResponsesReport
} from '$lib/server/pairing/responses';
import { discardStagedUpload, readStagedUpload, stageUpload } from '$lib/server/upload/staging';
import type { Actions, PageServerLoad } from './$types';

const CLOSED_MESSAGE = 'The preference form is closed. Reopen it on the Members page first.';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);
	const db = getDb();
	const cycle = getActiveCycle(db);
	if (!cycle) return { cycle: null, status: 'open' as const, options: null };

	const summary = (role: 'mentee' | 'mentor') => {
		const { names, duplicates } = listFormOptions(db, cycle.id, role);
		return { count: names.length, duplicates };
	};
	return {
		cycle,
		status: getFormStatus(db, cycle.id),
		options: { mentee: summary('mentee'), mentor: summary('mentor') }
	};
};

// Every branch of both actions returns these same keys, so the generated
// ActionData stays one shape and the page reads it without narrowing a union.
type ActionResult = {
	report: ResponsesReport | null;
	token: string | null;
	fileName: string | null;
	committed: { imported: number; replaced: number } | null;
	error: string | null;
};

const EMPTY: ActionResult = {
	report: null,
	token: null,
	fileName: null,
	committed: null,
	error: null
};

const problem = (message: string): ActionResult => ({ ...EMPTY, error: message });

type Staged = { csvText: string; cycleId: number };

export const actions: Actions = {
	validate: async ({ request, locals }) => {
		requireAdmin(locals);
		const db = getDb();
		const form = await request.formData();

		const cycle = getActiveCycle(db);
		if (!cycle) return fail(400, problem('There is no active cycle.'));
		if (getFormStatus(db, cycle.id) === 'closed') return fail(400, problem(CLOSED_MESSAGE));

		const file = form.get('file');
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, problem('Choose a CSV file to upload.'));
		}

		const csvText = await file.text();
		const { report } = previewResponses(db, cycle.id, parseCsv(csvText));

		return {
			...EMPTY,
			report,
			fileName: file.name,
			// A blocking report cannot be committed, so it is not staged.
			token:
				report.blocking.length === 0
					? stageUpload<Staged>('preferences', { csvText, cycleId: cycle.id })
					: null
		} satisfies ActionResult;
	},

	commit: async ({ request, locals }) => {
		requireAdmin(locals);
		const db = getDb();
		const form = await request.formData();

		const token = String(form.get('token') ?? '');
		const staged = readStagedUpload<Staged>('preferences', token);
		if (!staged) {
			return fail(400, problem('That upload expired or was already used. Upload the file again.'));
		}

		const cycle = getActiveCycle(db);
		if (!cycle || cycle.id !== staged.cycleId) {
			discardStagedUpload(token);
			return fail(400, problem('The active cycle changed. Upload the file again.'));
		}

		try {
			const committed = commitResponses(db, cycle.id, parseCsv(staged.csvText));
			discardStagedUpload(token);
			return { ...EMPTY, committed } satisfies ActionResult;
		} catch (err) {
			if (err instanceof ResponsesError) {
				discardStagedUpload(token);
				return fail(
					400,
					problem(
						err.code === 'closed'
							? CLOSED_MESSAGE
							: 'That file no longer validates. Upload it again.'
					)
				);
			}
			throw err;
		}
	}
};
