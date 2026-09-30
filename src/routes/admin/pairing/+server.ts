import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// The pairing page now lives on the members page. Kept so old bookmarks land there.
export const GET: RequestHandler = () => {
	redirect(308, '/admin/members');
};
