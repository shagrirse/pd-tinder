import { and, eq, sql } from 'drizzle-orm';
import type { AppDb } from '../db';
import { applicantPii, applicants, questions, ratings, users, verdicts } from '../db/schema';
import { CANONICAL_INDUSTRIES } from '../import/normalize';
import type { RatingValue } from '../review/verdict';
import { compareScored, scoreRatings } from './score';

export type RankedApplicant = {
	applicantId: number;
	publicRef: number;
	industry: string;
	fullName: string;
	score: number | null;
	rated: number;
	total: number;
	overall: RatingValue | null;
	redFlag: boolean;
	redFlagReason: string | null;
	note: string | null;
	reviewerName: string | null;
};

export type IndustryResults = {
	industry: string;
	ranked: RankedApplicant[];
	pending: RankedApplicant[];
	rejected: RankedApplicant[];
};

export function rankCycle(db: AppDb, cycleId: number): IndustryResults[] {
	const total =
		db
			.select({ count: sql<number>`count(*)` })
			.from(questions)
			.where(and(eq(questions.cycleId, cycleId), eq(questions.isRated, true)))
			.get()?.count ?? 0;

	const rows = db
		.select({
			applicantId: applicants.id,
			publicRef: applicants.publicRef,
			industry: applicants.industry1,
			fullName: applicantPii.fullName,
			overall: verdicts.overall,
			redFlag: verdicts.redFlag,
			redFlagReason: verdicts.redFlagReason,
			note: verdicts.note,
			reviewerName: users.name,
			hasVerdict: sql<number>`case when ${verdicts.id} is null then 0 else 1 end`
		})
		.from(applicants)
		.innerJoin(applicantPii, eq(applicantPii.applicantId, applicants.id))
		.leftJoin(verdicts, eq(verdicts.applicantId, applicants.id))
		.leftJoin(users, eq(users.id, verdicts.userId))
		.where(eq(applicants.cycleId, cycleId))
		.all();

	const ratingRows = db
		.select({ applicantId: ratings.applicantId, value: ratings.value })
		.from(ratings)
		.innerJoin(applicants, eq(applicants.id, ratings.applicantId))
		.where(eq(applicants.cycleId, cycleId))
		.all();

	const valuesByApplicant = new Map<number, RatingValue[]>();
	for (const row of ratingRows) {
		const list = valuesByApplicant.get(row.applicantId) ?? [];
		list.push(row.value);
		valuesByApplicant.set(row.applicantId, list);
	}

	const byIndustry = new Map<string, IndustryResults>();
	const bucketFor = (industry: string): IndustryResults => {
		let entry = byIndustry.get(industry);
		if (!entry) {
			entry = { industry, ranked: [], pending: [], rejected: [] };
			byIndustry.set(industry, entry);
		}
		return entry;
	};

	for (const row of rows) {
		const { score, rated } = scoreRatings(valuesByApplicant.get(row.applicantId) ?? [], total);
		const applicant: RankedApplicant = {
			applicantId: row.applicantId,
			publicRef: row.publicRef,
			industry: row.industry,
			fullName: row.fullName,
			score,
			rated,
			total,
			overall: row.overall,
			redFlag: row.redFlag ?? false,
			redFlagReason: row.redFlagReason,
			note: row.note,
			reviewerName: row.reviewerName
		};

		const bucket = bucketFor(row.industry);
		if (row.redFlag) bucket.rejected.push(applicant);
		else if (!row.hasVerdict) bucket.pending.push(applicant);
		else bucket.ranked.push(applicant);
	}

	for (const entry of byIndustry.values()) {
		entry.ranked.sort(compareScored);
		entry.pending.sort((a, b) => a.publicRef - b.publicRef);
		entry.rejected.sort((a, b) => a.publicRef - b.publicRef);
	}

	return CANONICAL_INDUSTRIES.filter((industry) => byIndustry.has(industry)).map(
		(industry) => byIndustry.get(industry)!
	);
}
