import { stringify } from 'csv-stringify/sync';
import { asc, eq } from 'drizzle-orm';
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

export function exportCycleCsv(db: AppDb, cycleId: number): string {
	const questionRows = db
		.select({ id: questions.id, key: questions.key, isRated: questions.isRated })
		.from(questions)
		.where(eq(questions.cycleId, cycleId))
		.orderBy(asc(questions.displayOrder))
		.all();

	const ratedQuestions = questionRows.filter((q) => q.isRated);

	const applicantRows = db
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
			overall: verdicts.overall,
			redFlag: verdicts.redFlag,
			redFlagReason: verdicts.redFlagReason,
			note: verdicts.note,
			reviewer: users.name
		})
		.from(applicants)
		.innerJoin(applicantPii, eq(applicantPii.applicantId, applicants.id))
		.leftJoin(verdicts, eq(verdicts.applicantId, applicants.id))
		.leftJoin(users, eq(users.id, verdicts.userId))
		.where(eq(applicants.cycleId, cycleId))
		.orderBy(asc(applicants.publicRef))
		.all();

	const answerRows = db
		.select({
			applicantId: responses.applicantId,
			questionId: responses.questionId,
			answerText: responses.answerText
		})
		.from(responses)
		.innerJoin(applicants, eq(applicants.id, responses.applicantId))
		.where(eq(applicants.cycleId, cycleId))
		.all();

	const ratingRows = db
		.select({
			applicantId: ratings.applicantId,
			questionId: ratings.questionId,
			value: ratings.value
		})
		.from(ratings)
		.innerJoin(applicants, eq(applicants.id, ratings.applicantId))
		.where(eq(applicants.cycleId, cycleId))
		.all();

	const answerAt = new Map(answerRows.map((r) => [`${r.applicantId}:${r.questionId}`, r.answerText]));
	const ratingAt = new Map(ratingRows.map((r) => [`${r.applicantId}:${r.questionId}`, r.value]));

	const records = applicantRows.map((row) => {
		const values = ratedQuestions
			.map((q) => ratingAt.get(`${row.applicantId}:${q.id}`))
			.filter((v): v is RatingValue => v !== undefined);
		const { score, rated, total } = scoreRatings(values, ratedQuestions.length);
		const reviewed = row.overall !== null || row.redFlag === true;

		const record: Record<string, string> = {
			public_ref: String(row.publicRef),
			full_name: row.fullName,
			email: row.email,
			smu_email: row.smuEmail ?? '',
			student_id: row.studentId,
			contact_number: row.contactNumber ?? '',
			telegram: row.telegram ?? '',
			linkedin_url: row.linkedinUrl ?? '',
			linkedin_status: row.linkedinStatus,
			industry_1: row.industry1,
			industry_2: row.industry2 ?? '',
			faculty: row.faculty ?? '',
			faculty_2: row.faculty2 ?? '',
			gender: row.gender ?? '',
			prior_mentee: String(row.priorMentee),
			submitted_at: row.submittedAt ? row.submittedAt.toISOString() : '',
			reviewer: reviewed ? (row.reviewer ?? '') : '',
			overall: row.overall ?? '',
			red_flag: row.redFlag ? 'true' : reviewed ? 'false' : '',
			red_flag_reason: row.redFlagReason ?? '',
			note: row.note ?? '',
			score: score === null ? '' : String(score),
			rated: reviewed ? String(rated) : '',
			total: String(total)
		};

		for (const question of ratedQuestions) {
			record[`rating_${question.key}`] = ratingAt.get(`${row.applicantId}:${question.id}`) ?? '';
		}
		for (const question of questionRows) {
			record[`answer_${question.key}`] = answerAt.get(`${row.applicantId}:${question.id}`) ?? '';
		}

		return record;
	});

	return stringify(records, { header: true });
}
