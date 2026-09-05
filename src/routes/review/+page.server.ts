import { fail } from '@sveltejs/kit';
import { getDb } from '$lib/server/db/instance';
import { requireAssignment, requireUser } from '$lib/server/auth/guards';
import { getActiveCycle } from '$lib/server/import/cycle';
import { getBlindApplicant } from '$lib/server/review/blind';
import { claimNext, hadExpiredClaim } from '$lib/server/review/claim';
import { getDeckProgress } from '$lib/server/review/deck';
import { getMySummary, getMyVerdict } from '$lib/server/review/reviewed';
import { VerdictError, submitVerdict, type RatingValue } from '$lib/server/review/verdict';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals);
	const db = getDb();

	const cycle = getActiveCycle(db);
	if (!cycle) return { state: 'no-cycle' as const };

	const industries = requireAssignment(db, user, cycle.id);
	const progress = getDeckProgress(db, user.id, cycle.id, industries);

	const claimReleased = hadExpiredClaim(db, user.id);

	const requested = Number(url.searchParams.get('applicant'));
	if (Number.isInteger(requested) && requested > 0) {
		const mine = getMyVerdict(db, user.id, requested);
		const applicant = mine ? getBlindApplicant(db, requested) : null;
		if (mine && applicant) {
			return {
				state: 'review' as const,
				cycleName: cycle.name,
				progress,
				applicant,
				existing: mine,
				claimReleased: false
			};
		}
	}

	const applicantId = claimNext(db, user.id, cycle.id, industries);
	if (applicantId === null) {
		return {
			state: 'empty' as const,
			progress,
			cycleName: cycle.name,
			summary: getMySummary(db, user.id, cycle.id)
		};
	}

	return {
		state: 'review' as const,
		cycleName: cycle.name,
		progress,
		applicant: getBlindApplicant(db, applicantId)!,
		existing: null,
		claimReleased
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const user = requireUser(locals);
		const db = getDb();
		const form = await request.formData();

		const applicantId = Number(form.get('applicantId'));
		if (!Number.isInteger(applicantId)) return fail(400, { error: 'Missing applicant.' });

		let ratings: { questionId: number; value: RatingValue }[];
		try {
			ratings = JSON.parse(String(form.get('ratings') ?? '[]'));
		} catch {
			return fail(400, { error: 'Ratings were not readable. Nothing was saved.' });
		}

		const overallRaw = String(form.get('overall') ?? '');
		const overall = ['like', 'meh', 'skip'].includes(overallRaw)
			? (overallRaw as RatingValue)
			: null;

		try {
			submitVerdict(db, user.id, applicantId, {
				overall,
				ratings,
				redFlag: form.get('redFlag') === 'true',
				redFlagReason: String(form.get('redFlagReason') ?? ''),
				note: String(form.get('note') ?? '')
			});
		} catch (error) {
			if (error instanceof VerdictError) return fail(400, { error: error.message });
			throw error;
		}

		return { saved: true };
	}
};
