import { error, json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db/instance';
import { requireAdmin } from '$lib/server/auth/guards';
import { getApplicantDetail } from '$lib/server/results/detail';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	requireAdmin(locals);

	const applicantId = Number(params.id);
	if (!Number.isInteger(applicantId) || applicantId <= 0) {
		throw error(404, 'No such applicant.');
	}

	const detail = getApplicantDetail(getDb(), applicantId);
	if (!detail) throw error(404, 'No such applicant.');

	return json(detail);
};
