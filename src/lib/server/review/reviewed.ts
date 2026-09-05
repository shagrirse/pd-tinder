import { and, desc, eq, sql } from 'drizzle-orm';
import type { AppDb } from '../db';
import { applicants, ratings, verdicts } from '../db/schema';
import type { RatingValue } from './verdict';

export type ReviewedItem = {
	applicantId: number;
	publicRef: number;
	industry1: string;
	overall: RatingValue | null;
	redFlag: boolean;
	ratedCount: number;
	updatedAt: Date;
};

export function listReviewedByUser(db: AppDb, userId: number, cycleId: number): ReviewedItem[] {
	return db
		.select({
			applicantId: verdicts.applicantId,
			publicRef: applicants.publicRef,
			industry1: applicants.industry1,
			overall: verdicts.overall,
			redFlag: verdicts.redFlag,
			updatedAt: verdicts.updatedAt,
			ratedCount: sql<number>`(
				select count(*) from ${ratings}
				where ${ratings.userId} = ${verdicts.userId}
				  and ${ratings.applicantId} = ${verdicts.applicantId}
			)`
		})
		.from(verdicts)
		.innerJoin(applicants, eq(applicants.id, verdicts.applicantId))
		.where(and(eq(verdicts.userId, userId), eq(applicants.cycleId, cycleId)))
		.orderBy(desc(verdicts.updatedAt))
		.all();
}

export function getMyVerdict(
	db: AppDb,
	userId: number,
	applicantId: number
): { ratings: Record<number, RatingValue>; note: string; overall: RatingValue | null; redFlag: boolean } | null {
	const verdict = db
		.select()
		.from(verdicts)
		.where(and(eq(verdicts.userId, userId), eq(verdicts.applicantId, applicantId)))
		.get();

	if (!verdict) return null;

	const rows = db
		.select({ questionId: ratings.questionId, value: ratings.value })
		.from(ratings)
		.where(and(eq(ratings.userId, userId), eq(ratings.applicantId, applicantId)))
		.all();

	return {
		ratings: Object.fromEntries(rows.map((r) => [r.questionId, r.value])),
		note: verdict.note ?? '',
		overall: verdict.overall,
		redFlag: verdict.redFlag
	};
}

export type MySummary = {
	total: number;
	like: number;
	meh: number;
	skip: number;
	redFlags: number;
};

export function getMySummary(db: AppDb, userId: number, cycleId: number): MySummary {
	const rows = db
		.select({ overall: verdicts.overall, redFlag: verdicts.redFlag })
		.from(verdicts)
		.innerJoin(applicants, eq(applicants.id, verdicts.applicantId))
		.where(and(eq(verdicts.userId, userId), eq(applicants.cycleId, cycleId)))
		.all();

	const summary: MySummary = { total: rows.length, like: 0, meh: 0, skip: 0, redFlags: 0 };
	for (const row of rows) {
		if (row.redFlag) summary.redFlags += 1;
		else if (row.overall) summary[row.overall] += 1;
	}
	return summary;
}
