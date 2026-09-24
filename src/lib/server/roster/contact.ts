/**
 * Contact handles as the platform stores them: bare, so one canonical form
 * feeds every display and export. Any common written form is accepted on the
 * way in — URL, `@handle`, or bare — and reduced to the bare value.
 */

/** Telegram handles are exactly the t.me path segment: letters, digits, underscores, 5–32 chars. */
export function normalizeTelegram(value: string): string | null {
	const handle = value
		.trim()
		.replace(/^https?:\/\/t\.me\//i, '')
		.replace(/^t\.me\//i, '')
		.replace(/^@/, '')
		.trim();
	if (handle === '') return null;
	return /^[A-Za-z0-9_]{5,32}$/.test(handle) ? handle : null;
}

/** LinkedIn profile slugs, without the site prefix or trailing slashes. */
export function normalizeLinkedin(value: string): string | null {
	const slug = value
		.trim()
		.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//i, '')
		.replace(/^linkedin\.com\/in\//i, '')
		.replace(/\/+$/, '');
	return slug === '' ? null : slug;
}
