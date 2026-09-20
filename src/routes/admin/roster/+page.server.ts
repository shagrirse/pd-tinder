import { fail } from '@sveltejs/kit';
import { getDb } from '$lib/server/db/instance';
import { requireAdmin } from '$lib/server/auth/guards';
import { listCycles } from '$lib/server/import/cycle';
import { parseCsv } from '$lib/server/import/parse';
import { previewRoster, type RosterReport } from '$lib/server/roster/validate';
import { commitRoster } from '$lib/server/roster/commit';
import { listRoster } from '$lib/server/roster/list';
import type { MemberRole } from '$lib/server/roster/members';
import { discardStagedUpload, readStagedUpload, stageUpload } from '$lib/server/upload/staging';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);
	const db = getDb();
	const cycles = listCycles(db);
	const rosters = Object.fromEntries(cycles.map((c) => [c.id, listRoster(db, c.id)]));
	return { cycles, rosters };
};

type ActionResult = {
	// SvelteKit hands the page whichever action's return ran, not a record
	// keyed by action name, so the page needs this to tell the panels apart.
	stage: 'validateMentees' | 'validateMentors' | 'commitMentees' | 'commitMentors' | null;
	report: RosterReport | null;
	token: string | null;
	cycleId: number | null;
	fileName: string | null;
	committed: { inserted: number; updated: number } | null;
	error: string | null;
};

const EMPTY: ActionResult = {
	stage: null,
	report: null,
	token: null,
	cycleId: null,
	fileName: null,
	committed: null,
	error: null
};

const problem = (message: string): ActionResult => ({ ...EMPTY, error: message });

type StagedRoster = { csvText: string; cycleId: number };

function validateAction(role: MemberRole, kind: 'mentees' | 'mentors') {
	const stage = kind === 'mentees' ? 'validateMentees' : 'validateMentors';
	return async ({ request, locals }: import('./$types').RequestEvent) => {
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
		const report = previewRoster(db, cycleId, role, parseCsv(csvText));

		return {
			...EMPTY,
			stage,
			report,
			cycleId,
			fileName: file.name,
			token: report.blocking.length === 0 ? stageUpload(kind, { csvText, cycleId }) : null
		} satisfies ActionResult;
	};
}

function commitAction(role: MemberRole, kind: 'mentees' | 'mentors') {
	const stage = kind === 'mentees' ? 'commitMentees' : 'commitMentors';
	return async ({ request, locals }: import('./$types').RequestEvent) => {
		requireAdmin(locals);
		const db = getDb();
		const form = await request.formData();

		const token = String(form.get('token') ?? '');
		const stagedFile = readStagedUpload<StagedRoster>(kind, token);
		if (!stagedFile) {
			return fail(
				400,
				problem('That upload expired or was already used. Upload the file again.')
			);
		}

		const cycle = listCycles(db).find((c) => c.id === stagedFile.cycleId);
		if (!cycle) {
			discardStagedUpload(token);
			return fail(400, problem('That cycle no longer exists.'));
		}
		if (cycle.status === 'closed') {
			discardStagedUpload(token);
			return fail(400, problem('That cycle was closed. Reopen it before importing.'));
		}

		const parsed = parseCsv(stagedFile.csvText);
		const report = previewRoster(db, stagedFile.cycleId, role, parsed);
		if (report.blocking.length > 0) {
			discardStagedUpload(token);
			return fail(400, problem('That file no longer validates. Upload it again.'));
		}

		const committed = commitRoster(db, stagedFile.cycleId, role, parsed);
		discardStagedUpload(token);

		return { ...EMPTY, stage, committed, cycleId: stagedFile.cycleId } satisfies ActionResult;
	};
}

export const actions: Actions = {
	validateMentees: validateAction('mentee', 'mentees'),
	commitMentees: commitAction('mentee', 'mentees'),
	validateMentors: validateAction('mentor', 'mentors'),
	commitMentors: commitAction('mentor', 'mentors')
};
