import { and, eq, gt, sql } from 'drizzle-orm';
import type { AppDb } from '../db';
import { applicants, claims, verdicts } from '../db/schema';
import { CANONICAL_INDUSTRIES } from '../import/normalize';

export type IndustryProgress = {
	industry: string;
	total: number;
	reviewed: number;
	claimed: number;
	remaining: number;
};

/**
 * Per-pool progress: how much of each industry is judged, in hand, or untouched.
 *
 * The three counts are disjoint by construction — `submitVerdict` deletes the
 * claim as it writes the verdict, `claimNext` refuses an applicant who already
 * has one, and `claims.applicantId` is a primary key — so `remaining` is a
 * subtraction rather than a fourth query. An expired claim counts as remaining,
 * which is what `claimNext` will actually serve next.
 */
export function getIndustryProgress(
	db: AppDb,
	cycleId: number,
	now: Date = new Date()
): IndustryProgress[] {
	const rows = db
		.select({
			industry: applicants.industry1,
			total: sql<number>`count(distinct ${applicants.id})`,
			reviewed: sql<number>`count(distinct case when ${verdicts.id} is not null then ${applicants.id} end)`,
			claimed: sql<number>`count(distinct case when ${verdicts.id} is null and ${claims.applicantId} is not null then ${applicants.id} end)`
		})
		.from(applicants)
		.leftJoin(verdicts, eq(verdicts.applicantId, applicants.id))
		.leftJoin(claims, and(eq(claims.applicantId, applicants.id), gt(claims.expiresAt, now)))
		.where(eq(applicants.cycleId, cycleId))
		.groupBy(applicants.industry1)
		.all();

	const byIndustry = new Map(rows.map((row) => [row.industry, row]));

	return CANONICAL_INDUSTRIES.filter((industry) => byIndustry.has(industry)).map((industry) => {
		const row = byIndustry.get(industry)!;
		return {
			industry,
			total: row.total,
			reviewed: row.reviewed,
			claimed: row.claimed,
			remaining: row.total - row.reviewed - row.claimed
		};
	});
}
