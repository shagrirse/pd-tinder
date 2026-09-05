import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db/instance';
import { redeemInvite } from '$lib/server/auth/invite';
import { users } from '$lib/server/db/schema';
import { SESSION_COOKIE, SESSION_TTL_MS, createSession } from '$lib/server/auth/session';
import type { Actions } from './$types';

const MIN_PASSWORD_LENGTH = 12;

export const actions: Actions = {
	default: async ({ request, params, cookies }) => {
		const form = await request.formData();
		const password = String(form.get('password') ?? '');

		if (password.length < MIN_PASSWORD_LENGTH) {
			return fail(400, { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
		}

		const db = getDb();
		const userId = await redeemInvite(db, params.token, password);
		if (userId === null) {
			return fail(400, { error: 'This invite link is invalid, expired, or already used.' });
		}

		const token = createSession(db, userId);
		cookies.set(SESSION_COOKIE, token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: process.env.NODE_ENV === 'production',
			maxAge: SESSION_TTL_MS / 1000
		});

		const redeemed = db.select({ role: users.role }).from(users).where(eq(users.id, userId)).get();
		throw redirect(303, redeemed?.role === 'admin' ? '/results' : '/review');
	}
};
