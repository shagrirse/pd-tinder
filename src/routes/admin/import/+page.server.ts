import { fail } from '@sveltejs/kit';
import { getDb } from '$lib/server/db/instance';
import { requireAdmin } from '$lib/server/auth/guards';
import { listCycles } from '$lib/server/import/cycle';
import { DEFAULT_COLUMN_MAPPING } from '$lib/server/import/columns';
import { parseCsv } from '$lib/server/import/parse';
import { validateImport, type ValidationReport } from '$lib/server/import/validate';
import { commitImport } from '$lib/server/import/commit';
import {
	discardStagedImport,
	readStagedImport,
	stageImport
} from '$lib/server/import/staging';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);
	return { cycles: listCycles(getDb()) };
};

// Every branch of both actions returns these same keys, so the generated
// ActionData stays one shape and the page reads it without narrowing a union.
type ActionResult = {
	report: ValidationReport | null;
	token: string | null;
	cycleId: number | null;
	fileName: string | null;
	committed: { inserted: number; updated: number } | null;
	error: string | null;
};

const EMPTY: ActionResult = {
	report: null,
	token: null,
	cycleId: null,
	fileName: null,
	committed: null,
	error: null
};

const problem = (message: string): ActionResult => ({ ...EMPTY, error: message });

export const actions: Actions = {
	validate: async ({ request, locals }) => {
		requireAdmin(locals);
		const db = getDb();
		const form = await request.formData();

		const cycleId = Number(form.get('cycleId'));
		if (!Number.isInteger(cycleId)) return fail(400, problem('Choose a cycle to import into.'));

		const cycle = listCycles(db).find((c) => c.id === cycleId);
		if (!cycle) return fail(400, problem('That cycle no longer exists.'));
		if (cycle.status === 'closed') {
			return fail(400, problem('That cycle is closed. Reopen it before importing.'));
		}

		const file = form.get('file');
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, problem('Choose a CSV file to upload.'));
		}

		const csvText = await file.text();
		const parsed = parseCsv(csvText);
		const report = validateImport(parsed, DEFAULT_COLUMN_MAPPING);

		return {
			...EMPTY,
			report,
			cycleId,
			fileName: file.name,
			// Nothing unusable is held in memory: a blocking report cannot be committed,
			// so it is not staged and the admin simply uploads a corrected file.
			token: report.blocking.length === 0 ? stageImport(csvText, cycleId) : null
		} satisfies ActionResult;
	},

	commit: async ({ request, locals }) => {
		requireAdmin(locals);
		const db = getDb();
		const form = await request.formData();

		const token = String(form.get('token') ?? '');
		const stagedFile = readStagedImport(token);
		if (!stagedFile) {
			return fail(
				400,
				problem('That upload expired or was already used. Upload the file again.')
			);
		}

		const cycle = listCycles(db).find((c) => c.id === stagedFile.cycleId);
		if (!cycle) {
			discardStagedImport(token);
			return fail(400, problem('That cycle no longer exists.'));
		}
		if (cycle.status === 'closed') {
			discardStagedImport(token);
			return fail(400, problem('That cycle was closed. Reopen it before importing.'));
		}

		const parsed = parseCsv(stagedFile.csvText);
		const report = validateImport(parsed, DEFAULT_COLUMN_MAPPING);
		if (report.blocking.length > 0) {
			discardStagedImport(token);
			return fail(400, problem('That file no longer validates. Upload it again.'));
		}

		const committed = commitImport(db, stagedFile.cycleId, parsed, DEFAULT_COLUMN_MAPPING);
		discardStagedImport(token);

		return { ...EMPTY, committed, cycleId: stagedFile.cycleId } satisfies ActionResult;
	}
};
