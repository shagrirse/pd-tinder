import type { Handle } from '@sveltejs/kit';
import { getDb } from '$lib/server/db/instance';
import { SESSION_COOKIE, resolveSession } from '$lib/server/auth/session';

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE);
	event.locals.user = token ? resolveSession(getDb(), token) : null;
	return resolve(event);
};
