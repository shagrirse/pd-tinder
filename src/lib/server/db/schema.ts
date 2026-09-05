import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

export const cycles = sqliteTable('cycles', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	year: integer('year').notNull(),
	status: text('status', { enum: ['draft', 'reviewing', 'closed'] }).notNull().default('draft'),
	columnMapping: text('column_mapping', { mode: 'json' }).$type<Record<string, string>>().notNull().default({}),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
});

export const questions = sqliteTable(
	'questions',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		cycleId: integer('cycle_id').notNull().references(() => cycles.id),
		key: text('key').notNull(),
		prompt: text('prompt').notNull(),
		displayOrder: integer('display_order').notNull(),
		isRated: integer('is_rated', { mode: 'boolean' }).notNull().default(true)
	},
	(t) => [unique('questions_cycle_key').on(t.cycleId, t.key)]
);

export const applicants = sqliteTable(
	'applicants',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		cycleId: integer('cycle_id').notNull().references(() => cycles.id),
		publicRef: integer('public_ref').notNull(),
		industry1: text('industry_1').notNull(),
		industry2: text('industry_2'),
		faculty: text('faculty'),
		faculty2: text('faculty_2'),
		gender: text('gender'),
		priorMentee: integer('prior_mentee', { mode: 'boolean' }).notNull().default(false),
		linkedinStatus: text('linkedin_status', { enum: ['valid', 'missing'] }).notNull(),
		submittedAt: integer('submitted_at', { mode: 'timestamp' })
	},
	(t) => [
		unique('applicants_cycle_ref').on(t.cycleId, t.publicRef),
		index('applicants_pool').on(t.cycleId, t.industry1)
	]
);

export const applicantPii = sqliteTable('applicant_pii', {
	applicantId: integer('applicant_id').primaryKey().references(() => applicants.id),
	fullName: text('full_name').notNull(),
	email: text('email').notNull(),
	smuEmail: text('smu_email'),
	studentId: text('student_id').notNull(),
	contactNumber: text('contact_number'),
	telegram: text('telegram'),
	linkedinUrl: text('linkedin_url')
});

export const responses = sqliteTable(
	'responses',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		applicantId: integer('applicant_id').notNull().references(() => applicants.id),
		questionId: integer('question_id').notNull().references(() => questions.id),
		answerText: text('answer_text').notNull().default('')
	},
	(t) => [unique('responses_applicant_question').on(t.applicantId, t.questionId)]
);

export const users = sqliteTable('users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	passwordHash: text('password_hash'),
	role: text('role', { enum: ['admin', 'reviewer'] }).notNull().default('reviewer'),
	active: integer('active', { mode: 'boolean' }).notNull().default(true)
});

export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(),
	userId: integer('user_id').notNull().references(() => users.id),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull()
});

export const invites = sqliteTable('invites', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull().references(() => users.id),
	tokenHash: text('token_hash').notNull().unique(),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
	usedAt: integer('used_at', { mode: 'timestamp' })
});

export const assignments = sqliteTable(
	'assignments',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id').notNull().references(() => users.id),
		cycleId: integer('cycle_id').notNull().references(() => cycles.id),
		industry: text('industry').notNull()
	},
	(t) => [unique('assignments_user_cycle_industry').on(t.userId, t.cycleId, t.industry)]
);

export const claims = sqliteTable('claims', {
	applicantId: integer('applicant_id').primaryKey().references(() => applicants.id),
	userId: integer('user_id').notNull().references(() => users.id),
	claimedAt: integer('claimed_at', { mode: 'timestamp' }).notNull(),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull()
});

export const ratings = sqliteTable(
	'ratings',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id').notNull().references(() => users.id),
		applicantId: integer('applicant_id').notNull().references(() => applicants.id),
		questionId: integer('question_id').notNull().references(() => questions.id),
		value: text('value', { enum: ['like', 'meh', 'skip'] }).notNull()
	},
	(t) => [unique('ratings_user_applicant_question').on(t.userId, t.applicantId, t.questionId)]
);

export const verdicts = sqliteTable(
	'verdicts',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id').notNull().references(() => users.id),
		applicantId: integer('applicant_id').notNull().references(() => applicants.id),
		overall: text('overall', { enum: ['like', 'meh', 'skip'] }),
		redFlag: integer('red_flag', { mode: 'boolean' }).notNull().default(false),
		redFlagReason: text('red_flag_reason'),
		note: text('note'),
		submittedAt: integer('submitted_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
	},
	(t) => [unique('verdicts_user_applicant').on(t.userId, t.applicantId)]
);
