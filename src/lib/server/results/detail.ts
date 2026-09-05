import { and, asc, eq } from 'drizzle-orm';
import type { AppDb } from '../db';
import {
	applicantPii,
	applicants,
	questions,
	ratings,
	responses,
	users,
	verdicts
} from '../db/schema';
import type { RatingValue } from '../review/verdict';
import { scoreRatings } from './score';

export type DetailAnswer = {
	questionId: number;
	key: string;
	prompt: string;
	isRated: boolean;
	answerText: string;
	rating: RatingValue | null;
};

/**
 * The complete, non-blind record for one applicant. Admin-only by construction:
 * this is the counterpart to `review/blind.ts`, and must never be reached from a
 * reviewer-facing route.
 */
export type ApplicantDetail = {
	applicantId: number;
	publicRef: number;
	industry1: string;
	industry2: string | null;
	faculty: string | null;
	faculty2: string | null;
	gender: string | null;
	priorMentee: boolean;
	linkedinStatus: 'valid' | 'missing';
	submittedAt: Date | null;
	fullName: string;
	email: string;
	smuEmail: string | null;
	studentId: string;
	contactNumber: string | null;
	telegram: string | null;
	linkedinUrl: string | null;
	score: number | null;
	rated: number;
	total: number;
	overall: RatingValue | null;
	redFlag: boolean;
	redFlagReason: string | null;
	note: string | null;
	reviewerName: string | null;
	answers: DetailAnswer[];
};

export function getApplicantDetail(db: AppDb, applicantId: number): ApplicantDetail | null {
	const row = db
		.select({
			applicantId: applicants.id,
			publicRef: applicants.publicRef,
			industry1: applicants.industry1,
			industry2: applicants.industry2,
			faculty: applicants.faculty,
			faculty2: applicants.faculty2,
			gender: applicants.gender,
			priorMentee: applicants.priorMentee,
			linkedinStatus: applicants.linkedinStatus,
			submittedAt: applicants.submittedAt,
			fullName: applicantPii.fullName,
			email: applicantPii.email,
			smuEmail: applicantPii.smuEmail,
			studentId: applicantPii.studentId,
			contactNumber: applicantPii.contactNumber,
			telegram: applicantPii.telegram,
			linkedinUrl: applicantPii.linkedinUrl,
			reviewerId: verdicts.userId,
			reviewerName: users.name,
			overall: verdicts.overall,
			redFlag: verdicts.redFlag,
			redFlagReason: verdicts.redFlagReason,
			note: verdicts.note
		})
		.from(applicants)
		.innerJoin(applicantPii, eq(applicantPii.applicantId, applicants.id))
		.leftJoin(verdicts, eq(verdicts.applicantId, applicants.id))
		.leftJoin(users, eq(users.id, verdicts.userId))
		.where(eq(applicants.id, applicantId))
		.get();

	if (!row) return null;

	const answerRows = db
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

	// Only the reviewer who submitted the verdict owns the ratings shown here.
	// Another reviewer's stray ratings must never be mixed into this record.
	const ratingRows = row.reviewerId
		? db
				.select({ questionId: ratings.questionId, value: ratings.value })
				.from(ratings)
				.where(and(eq(ratings.applicantId, applicantId), eq(ratings.userId, row.reviewerId)))
				.all()
		: [];

	const ratingByQuestion = new Map(ratingRows.map((r) => [r.questionId, r.value]));

	const answers: DetailAnswer[] = answerRows.map((answer) => ({
		questionId: answer.questionId,
		key: answer.key,
		prompt: answer.prompt,
		isRated: answer.isRated,
		answerText: answer.answerText,
		rating: answer.isRated ? (ratingByQuestion.get(answer.questionId) ?? null) : null
	}));

	const ratedQuestions = answers.filter((a) => a.isRated);
	const values = ratedQuestions
		.map((a) => a.rating)
		.filter((v): v is RatingValue => v !== null);
	const { score, rated, total } = scoreRatings(values, ratedQuestions.length);

	return {
		applicantId: row.applicantId,
		publicRef: row.publicRef,
		industry1: row.industry1,
		industry2: row.industry2,
		faculty: row.faculty,
		faculty2: row.faculty2,
		gender: row.gender,
		priorMentee: row.priorMentee,
		linkedinStatus: row.linkedinStatus,
		submittedAt: row.submittedAt,
		fullName: row.fullName,
		email: row.email,
		smuEmail: row.smuEmail,
		studentId: row.studentId,
		contactNumber: row.contactNumber,
		telegram: row.telegram,
		linkedinUrl: row.linkedinUrl,
		score,
		rated,
		total,
		overall: row.overall,
		redFlag: row.redFlag ?? false,
		redFlagReason: row.redFlagReason,
		note: row.note,
		reviewerName: row.reviewerName,
		answers
	};
}
