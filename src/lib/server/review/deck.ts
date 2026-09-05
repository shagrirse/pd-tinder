import { and, eq, inArray, sql } from 'drizzle-orm';
import type { AppDb } from '../db';
import { applicants, verdicts } from '../db/schema';

export type DeckProgress = {
	reviewedByMe: number;
	remaining: number;
	poolSize: number;
};

export function getDeckProgress(
	db: AppDb,
	userId: number,
	cycleId: number,
	industries: string[]
): DeckProgress {
	if (industries.length === 0) return { reviewedByMe: 0, remaining: 0, poolSize: 0 };

	const pool = db
		.select({ count: sql<number>`count(*)` })
		.from(applicants)
		.where(and(eq(applicants.cycleId, cycleId), inArray(applicants.industry1, industries)))
		.get();

	const reviewed = db
		.select({ count: sql<number>`count(*)` })
		.from(verdicts)
		.innerJoin(applicants, eq(applicants.id, verdicts.applicantId))
		.where(
			and(
				eq(verdicts.userId, userId),
				eq(applicants.cycleId, cycleId),
				inArray(applicants.industry1, industries)
			)
		)
		.get();

	const anyVerdict = db
		.select({ count: sql<number>`count(distinct ${verdicts.applicantId})` })
		.from(verdicts)
		.innerJoin(applicants, eq(applicants.id, verdicts.applicantId))
		.where(and(eq(applicants.cycleId, cycleId), inArray(applicants.industry1, industries)))
		.get();

	const poolSize = pool?.count ?? 0;
	return {
		reviewedByMe: reviewed?.count ?? 0,
		remaining: poolSize - (anyVerdict?.count ?? 0),
		poolSize
	};
}
