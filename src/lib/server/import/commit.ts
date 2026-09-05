import { and, eq, sql } from 'drizzle-orm';
import type { AppDb } from '../db';
import { applicantPii, applicants, questions, responses } from '../db/schema';
import {
	QUESTION_KEYS,
	QUESTION_PROMPTS,
	RATED_QUESTION_KEYS,
	type QuestionKey
} from './columns';
import { classifyLinkedin, normalizeGender, normalizeIndustry, normalizePriorMentee } from './normalize';
import type { ParsedCsv } from './parse';

export type CommitResult = { inserted: number; updated: number };

const RATED = new Set<string>(RATED_QUESTION_KEYS);

export function commitImport(
	db: AppDb,
	cycleId: number,
	parsed: ParsedCsv,
	mapping: Record<string, string>,
	now: Date = new Date()
): CommitResult {
	const headerForField: Record<string, string> = {};
	for (const [header, field] of Object.entries(mapping)) headerForField[field] = header;
	const read = (row: Record<string, string>, field: string): string =>
		(row[headerForField[field] ?? ''] ?? '').trim();

	let inserted = 0;
	let updated = 0;

	db.transaction((tx) => {
		// Ensure this cycle's questions exist, in form order.
		const questionIdByKey = new Map<string, number>();
		QUESTION_KEYS.forEach((key: QuestionKey, index) => {
			const existing = tx
				.select({ id: questions.id })
				.from(questions)
				.where(and(eq(questions.cycleId, cycleId), eq(questions.key, key)))
				.get();

			if (existing) {
				questionIdByKey.set(key, existing.id);
				return;
			}

			const created = tx
				.insert(questions)
				.values({
					cycleId,
					key,
					prompt: QUESTION_PROMPTS[key],
					displayOrder: index,
					isRated: RATED.has(key)
				})
				.returning({ id: questions.id })
				.get();
			questionIdByKey.set(key, created.id);
		});

		const maxRef = tx
			.select({ value: sql<number>`coalesce(max(${applicants.publicRef}), 0)` })
			.from(applicants)
			.where(eq(applicants.cycleId, cycleId))
			.get();
		let nextRef = (maxRef?.value ?? 0) + 1;

		for (const row of parsed.rows) {
			const studentId = read(row, 'student_id');
			if (studentId === '') continue;

			const industry1 = normalizeIndustry(read(row, 'industry_1'));
			if (!industry1) continue;

			const timestampRaw = read(row, 'timestamp');
			const submittedAt = timestampRaw ? new Date(timestampRaw) : null;

			const applicantFields = {
				cycleId,
				industry1,
				industry2: normalizeIndustry(read(row, 'industry_2')),
				faculty: read(row, 'faculty') || null,
				faculty2: read(row, 'faculty_2') || null,
				gender: normalizeGender(read(row, 'gender')),
				priorMentee: normalizePriorMentee(read(row, 'prior_mentee')),
				linkedinStatus: classifyLinkedin(read(row, 'linkedin')),
				submittedAt: submittedAt && !Number.isNaN(submittedAt.getTime()) ? submittedAt : now
			};

			const existing = tx
				.select({ id: applicants.id })
				.from(applicants)
				.innerJoin(applicantPii, eq(applicantPii.applicantId, applicants.id))
				.where(and(eq(applicants.cycleId, cycleId), eq(applicantPii.studentId, studentId)))
				.get();

			let applicantId: number;
			if (existing) {
				applicantId = existing.id;
				tx.update(applicants).set(applicantFields).where(eq(applicants.id, applicantId)).run();
				updated += 1;
			} else {
				applicantId = tx
					.insert(applicants)
					.values({ ...applicantFields, publicRef: nextRef })
					.returning({ id: applicants.id })
					.get().id;
				nextRef += 1;
				inserted += 1;
			}

			const piiFields = {
				fullName: read(row, 'full_name'),
				email: read(row, 'email'),
				smuEmail: read(row, 'smu_email') || null,
				studentId,
				contactNumber: read(row, 'contact_number') || null,
				telegram: read(row, 'telegram') || null,
				linkedinUrl: read(row, 'linkedin') || null
			};

			tx.insert(applicantPii)
				.values({ applicantId, ...piiFields })
				.onConflictDoUpdate({ target: applicantPii.applicantId, set: piiFields })
				.run();

			for (const key of QUESTION_KEYS) {
				const questionId = questionIdByKey.get(key)!;
				const answerText = row[headerForField[key] ?? ''] ?? '';
				tx.insert(responses)
					.values({ applicantId, questionId, answerText })
					.onConflictDoUpdate({
						target: [responses.applicantId, responses.questionId],
						set: { answerText }
					})
					.run();
			}
		}
	});

	return { inserted, updated };
}
