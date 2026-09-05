import { describe, expect, it } from 'vitest';
import { compareScored, scoreRatings } from '../../../src/lib/server/results/score';

describe('scoreRatings', () => {
	it('scores all likes as 1', () => {
		expect(scoreRatings(['like', 'like', 'like', 'like'], 8)).toEqual({
			score: 1,
			rated: 4,
			total: 8
		});
	});

	it('scores all skips as -1', () => {
		expect(scoreRatings(['skip', 'skip'], 8).score).toBe(-1);
	});

	it('scores all mehs as 0', () => {
		expect(scoreRatings(['meh', 'meh', 'meh'], 8).score).toBe(0);
	});

	it('averages a mixed set', () => {
		expect(scoreRatings(['like', 'like', 'skip', 'meh'], 8).score).toBeCloseTo(0.25);
	});

	it('averages over what was rated, not the total', () => {
		const partial = scoreRatings(['like'], 8);
		expect(partial.score).toBe(1);
		expect(partial.rated).toBe(1);
		expect(partial.total).toBe(8);
	});

	it('returns null rather than zero when nothing was rated', () => {
		expect(scoreRatings([], 8)).toEqual({ score: null, rated: 0, total: 8 });
	});
});

describe('compareScored', () => {
	const base = { rated: 8, total: 8, overall: 'like' as const, applicantId: 1 };

	it('puts higher scores first', () => {
		const high = { ...base, score: 0.5, applicantId: 1 };
		const low = { ...base, score: -0.5, applicantId: 2 };
		expect([low, high].sort(compareScored)[0]).toBe(high);
	});

	it('puts unscored applicants last', () => {
		const scored = { ...base, score: -1, applicantId: 1 };
		const unscored = { ...base, score: null, applicantId: 2 };
		expect([unscored, scored].sort(compareScored)[0]).toBe(scored);
	});

	it('breaks ties on the overall verdict', () => {
		const liked = { ...base, score: 0, overall: 'like' as const, applicantId: 2 };
		const skipped = { ...base, score: 0, overall: 'skip' as const, applicantId: 1 };
		expect([skipped, liked].sort(compareScored)[0]).toBe(liked);
	});

	it('then breaks ties on coverage', () => {
		const thorough = { ...base, score: 0, rated: 8, applicantId: 2 };
		const partial = { ...base, score: 0, rated: 2, applicantId: 1 };
		expect([partial, thorough].sort(compareScored)[0]).toBe(thorough);
	});

	it('finally orders by applicant id for stability', () => {
		const first = { ...base, score: 0, applicantId: 1 };
		const second = { ...base, score: 0, applicantId: 2 };
		expect([second, first].sort(compareScored)[0]).toBe(first);
	});
});
