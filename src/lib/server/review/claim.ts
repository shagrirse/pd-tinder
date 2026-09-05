import { and, asc, eq, gt, inArray, isNull, lte } from 'drizzle-orm';
import type { AppDb } from '../db';
import { applicants, claims, verdicts } from '../db/schema';

export const CLAIM_TTL_MS = 2 * 60 * 60 * 1000;

export function getActiveClaim(db: AppDb, userId: number, now: Date = new Date()): number | null {
	const row = db
		.select({ applicantId: claims.applicantId })
		.from(claims)
		.where(and(eq(claims.userId, userId), gt(claims.expiresAt, now)))
		.get();
	return row?.applicantId ?? null;
}

export function releaseClaim(db: AppDb, applicantId: number, userId: number): void {
	db.delete(claims)
		.where(and(eq(claims.applicantId, applicantId), eq(claims.userId, userId)))
		.run();
}

export function hadExpiredClaim(db: AppDb, userId: number, now: Date = new Date()): boolean {
	const row = db
		.select({ applicantId: claims.applicantId })
		.from(claims)
		.where(and(eq(claims.userId, userId), lte(claims.expiresAt, now)))
		.get();
	return row !== undefined;
}

export function releaseExpiredClaims(db: AppDb, now: Date = new Date()): number {
	return db.delete(claims).where(lte(claims.expiresAt, now)).run().changes;
}

export function claimNext(
	db: AppDb,
	userId: number,
	cycleId: number,
	industries: string[],
	now: Date = new Date()
): number | null {
	if (industries.length === 0) return null;

	return db.transaction((tx) => {
		const existing = tx
			.select({ applicantId: claims.applicantId })
			.from(claims)
			.where(and(eq(claims.userId, userId), gt(claims.expiresAt, now)))
			.get();
		if (existing) return existing.applicantId;

		tx.delete(claims).where(lte(claims.expiresAt, now)).run();

		const candidate = tx
			.select({ id: applicants.id })
			.from(applicants)
			.leftJoin(claims, eq(claims.applicantId, applicants.id))
			.leftJoin(verdicts, eq(verdicts.applicantId, applicants.id))
			.where(
				and(
					eq(applicants.cycleId, cycleId),
					inArray(applicants.industry1, industries),
					isNull(claims.applicantId),
					isNull(verdicts.applicantId)
				)
			)
			.orderBy(asc(applicants.publicRef))
			.get();

		if (!candidate) return null;

		tx.insert(claims)
			.values({
				applicantId: candidate.id,
				userId,
				claimedAt: now,
				expiresAt: new Date(now.getTime() + CLAIM_TTL_MS)
			})
			.run();

		return candidate.id;
	});
}
