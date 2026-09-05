import { redirect } from '@sveltejs/kit';
import { getDb } from '$lib/server/db/instance';
import { SESSION_COOKIE, destroySession } from '$lib/server/auth/session';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {
	const token = cookies.get(SESSION_COOKIE);
	if (token) destroySession(getDb(), token);
	cookies.delete(SESSION_COOKIE, { path: '/' });
	throw redirect(303, '/login');
};
