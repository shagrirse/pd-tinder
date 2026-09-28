import type { RatingValue } from '$lib/draft';

export const VERDICT_LABEL: Record<RatingValue, string> = {
	like: 'Good',
	meh: 'Meh',
	skip: 'Weak'
};
