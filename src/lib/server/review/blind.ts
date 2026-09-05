import { asc, eq } from 'drizzle-orm';
import type { AppDb } from '../db';
import { applicants, questions, responses } from '../db/schema';

/**
 * Property names owned by `applicant_pii`. This module must never select them,
 * and `tests/integration/review/blind.test.ts` asserts they never appear.
 */
export const PII_FIELD_NAMES = [
	'fullName',
	'email',
	'smuEmail',
	'studentId',
	'contactNumber',
	'telegram',
	'linkedinUrl'
] as const;

export type BlindAnswer = {
	questionId: number;
	key: string;
	prompt: string;
	isRated: boolean;
	answerText: string;
};

export type BlindApplicant = {
	id: number;
	publicRef: number;
	industry1: string;
	industry2: string | null;
	faculty: string | null;
	faculty2: string | null;
	gender: string | null;
	priorMentee: boolean;
	linkedinMissing: boolean;
	answers: BlindAnswer[];
};

export function getBlindApplicant(db: AppDb, applicantId: number): BlindApplicant | null {
	const applicant = db
		.select({
			id: applicants.id,
			publicRef: applicants.publicRef,
			industry1: applicants.industry1,
			industry2: applicants.industry2,
			faculty: applicants.faculty,
			faculty2: applicants.faculty2,
			gender: applicants.gender,
			priorMentee: applicants.priorMentee,
			linkedinStatus: applicants.linkedinStatus
		})
		.from(applicants)
		.where(eq(applicants.id, applicantId))
		.get();

	if (!applicant) return null;

	const answers = db
		.select({
			questionId: questions.id,
			key: questions.key,
			prompt: questions.prompt,
			isRated: questions.isRated,
			answerText: responses.answerText
		})
		.from(responses)
		.innerJoin(questions, eq(questions.id, responses.questionId))
		.where(eq(responses.applicantId, applicantId))
		.orderBy(asc(questions.displayOrder))
		.all();

	const { linkedinStatus, ...rest } = applicant;
	return { ...rest, linkedinMissing: linkedinStatus === 'missing', answers };
}
