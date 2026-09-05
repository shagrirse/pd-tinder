import { and, eq, gt, inArray } from 'drizzle-orm';
import type { AppDb } from '../db';
import { claims, questions, ratings, verdicts } from '../db/schema';

export const MIN_RED_FLAG_REASON_LENGTH = 10;

export type RatingValue = 'like' | 'meh' | 'skip';

export type VerdictInput = {
	overall: RatingValue | null;
	ratings: { questionId: number; value: RatingValue }[];
	redFlag?: boolean;
	redFlagReason?: string | null;
	note?: string | null;
};

export class VerdictError extends Error {}

export function submitVerdict(
	db: AppDb,
	userId: number,
	applicantId: number,
	input: VerdictInput,
	now: Date = new Date()
): void {
	const redFlag = input.redFlag === true;
	const reason = (input.redFlagReason ?? '').trim();

	if (redFlag && reason.length < MIN_RED_FLAG_REASON_LENGTH) {
		throw new VerdictError('A red flag needs a written reason.');
	}
	if (!redFlag && input.overall === null) {
		throw new VerdictError('Choose an overall verdict.');
	}

	const existingVerdict = db
		.select({ submittedAt: verdicts.submittedAt })
		.from(verdicts)
		.where(and(eq(verdicts.userId, userId), eq(verdicts.applicantId, applicantId)))
		.get();

	const heldClaim = db
		.select({ applicantId: claims.applicantId })
		.from(claims)
		.where(
			and(eq(claims.applicantId, applicantId), eq(claims.userId, userId), gt(claims.expiresAt, now))
		)
		.get();

	if (!heldClaim && !existingVerdict) {
		throw new VerdictError('This applicant is not assigned to you.');
	}

	if (input.ratings.length > 0) {
		const questionIds = input.ratings.map((r) => r.questionId);
		const rateable = db
			.select({ id: questions.id })
			.from(questions)
			.where(and(inArray(questions.id, questionIds), eq(questions.isRated, true)))
			.all();

		if (rateable.length !== new Set(questionIds).size) {
			throw new VerdictError('One or more ratings refer to a question that cannot be rated.');
		}
	}

	db.transaction((tx) => {
		tx.delete(ratings)
			.where(and(eq(ratings.userId, userId), eq(ratings.applicantId, applicantId)))
			.run();

		if (input.ratings.length > 0) {
			tx.insert(ratings)
				.values(input.ratings.map((r) => ({ userId, applicantId, questionId: r.questionId, value: r.value })))
				.run();
		}

		const fields = {
			overall: redFlag ? null : input.overall,
			redFlag,
			redFlagReason: redFlag ? reason : null,
			note: input.note?.trim() || null,
			updatedAt: now
		};

		tx.insert(verdicts)
			.values({ userId, applicantId, ...fields, submittedAt: existingVerdict?.submittedAt ?? now })
			.onConflictDoUpdate({ target: [verdicts.userId, verdicts.applicantId], set: fields })
			.run();

		tx.delete(claims)
			.where(and(eq(claims.applicantId, applicantId), eq(claims.userId, userId)))
			.run();
	});
}
