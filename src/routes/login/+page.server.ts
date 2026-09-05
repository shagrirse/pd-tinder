import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db/instance';
import { users } from '$lib/server/db/schema';
import { verifyPassword } from '$lib/server/auth/password';
import { SESSION_COOKIE, SESSION_TTL_MS, createSession } from '$lib/server/auth/session';
import { clearAttempts, isAllowed, recordFailure } from '$lib/server/auth/rateLimit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) throw redirect(303, '/review');
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		const password = String(form.get('password') ?? '');
		const key = `${getClientAddress()}:${email}`;
		const db = getDb();

		if (!isAllowed(key)) {
			return fail(429, { error: 'Too many attempts. Try again in 15 minutes.' });
		}

		const user = db.select().from(users).where(eq(users.email, email)).get();
		const ok =
			user?.active && user.passwordHash
				? await verifyPassword(password, user.passwordHash)
				: false;

		if (!ok || !user) {
			recordFailure(key);
			return fail(400, { error: 'Incorrect email or password.' });
		}

		clearAttempts(key);
		const token = createSession(db, user.id);
		cookies.set(SESSION_COOKIE, token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: process.env.NODE_ENV === 'production',
			maxAge: SESSION_TTL_MS / 1000
		});

		throw redirect(303, user.role === 'admin' ? '/results' : '/review');
	}
};
