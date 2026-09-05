import type { RatingValue } from '../review/verdict';

export const RATING_SCORES: Record<RatingValue, number> = { like: 1, meh: 0, skip: -1 };

export type Score = {
	score: number | null;
	rated: number;
	total: number;
};

export function scoreRatings(values: RatingValue[], totalRatedQuestions: number): Score {
	if (values.length === 0) return { score: null, rated: 0, total: totalRatedQuestions };

	const sum = values.reduce((total, value) => total + RATING_SCORES[value], 0);
	return { score: sum / values.length, rated: values.length, total: totalRatedQuestions };
}

const VERDICT_RANK: Record<RatingValue, number> = { like: 3, meh: 2, skip: 1 };

export type Scored = Score & {
	overall: RatingValue | null;
	applicantId: number;
};

export function compareScored(a: Scored, b: Scored): number {
	// Unscored applicants sort last regardless of anything else.
	if (a.score === null && b.score !== null) return 1;
	if (b.score === null && a.score !== null) return -1;
	if (a.score !== null && b.score !== null && a.score !== b.score) return b.score - a.score;

	const aRank = a.overall ? VERDICT_RANK[a.overall] : 0;
	const bRank = b.overall ? VERDICT_RANK[b.overall] : 0;
	if (aRank !== bRank) return bRank - aRank;

	if (a.rated !== b.rated) return b.rated - a.rated;
	return a.applicantId - b.applicantId;
}
