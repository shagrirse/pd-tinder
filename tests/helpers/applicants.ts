import type { AppDb } from '../../src/lib/server/db';
import { applicantPii, applicants } from '../../src/lib/server/db/schema';

export type SeedApplicantInput = {
	cycleId: number;
	publicRef: number;
	industry1: string;
	fullName: string;
	email: string;
	studentId: string;
};

/** Insert a minimal applicant (with PII) so roster tests can resolve against it. */
export function seedApplicant(db: AppDb, input: SeedApplicantInput): number {
	const applicantId = db
		.insert(applicants)
		.values({
			cycleId: input.cycleId,
			publicRef: input.publicRef,
			industry1: input.industry1,
			linkedinStatus: 'valid'
		})
		.returning({ id: applicants.id })
		.get().id;

	db.insert(applicantPii)
		.values({
			applicantId,
			fullName: input.fullName,
			email: input.email,
			studentId: input.studentId
		})
		.run();

	return applicantId;
}
