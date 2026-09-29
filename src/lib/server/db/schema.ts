import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

export const cycles = sqliteTable('cycles', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	year: integer('year').notNull(),
	status: text('status', { enum: ['draft', 'reviewing', 'closed'] })
		.notNull()
		.default('draft'),
	columnMapping: text('column_mapping', { mode: 'json' })
		.$type<Record<string, string>>()
		.notNull()
		.default({}),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`)
});

export const questions = sqliteTable(
	'questions',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		cycleId: integer('cycle_id')
			.notNull()
			.references(() => cycles.id),
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
		cycleId: integer('cycle_id')
			.notNull()
			.references(() => cycles.id),
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
	applicantId: integer('applicant_id')
		.primaryKey()
		.references(() => applicants.id),
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
		applicantId: integer('applicant_id')
			.notNull()
			.references(() => applicants.id),
		questionId: integer('question_id')
			.notNull()
			.references(() => questions.id),
		answerText: text('answer_text').notNull().default('')
	},
	(t) => [unique('responses_applicant_question').on(t.applicantId, t.questionId)]
);

export const users = sqliteTable('users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	passwordHash: text('password_hash'),
	role: text('role', { enum: ['admin', 'reviewer'] })
		.notNull()
		.default('reviewer'),
	active: integer('active', { mode: 'boolean' }).notNull().default(true)
});

export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull()
});

export const invites = sqliteTable('invites', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id),
	tokenHash: text('token_hash').notNull().unique(),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
	usedAt: integer('used_at', { mode: 'timestamp' })
});

export const assignments = sqliteTable(
	'assignments',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id),
		cycleId: integer('cycle_id')
			.notNull()
			.references(() => cycles.id),
		industry: text('industry').notNull()
	},
	(t) => [unique('assignments_user_cycle_industry').on(t.userId, t.cycleId, t.industry)]
);

export const claims = sqliteTable('claims', {
	applicantId: integer('applicant_id')
		.primaryKey()
		.references(() => applicants.id),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id),
	claimedAt: integer('claimed_at', { mode: 'timestamp' }).notNull(),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull()
});

export const ratings = sqliteTable(
	'ratings',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id),
		applicantId: integer('applicant_id')
			.notNull()
			.references(() => applicants.id),
		questionId: integer('question_id')
			.notNull()
			.references(() => questions.id),
		value: text('value', { enum: ['like', 'meh', 'skip'] }).notNull()
	},
	(t) => [unique('ratings_user_applicant_question').on(t.userId, t.applicantId, t.questionId)]
);

export const verdicts = sqliteTable(
	'verdicts',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id),
		applicantId: integer('applicant_id')
			.notNull()
			.references(() => applicants.id),
		overall: text('overall', { enum: ['like', 'meh', 'skip'] }),
		redFlag: integer('red_flag', { mode: 'boolean' }).notNull().default(false),
		redFlagReason: text('red_flag_reason'),
		note: text('note'),
		submittedAt: integer('submitted_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
	},
	(t) => [unique('verdicts_user_applicant').on(t.userId, t.applicantId)]
);

/**
 * The membership domain. Identity is the whole point here, which is the opposite
 * of the selection domain above: `applicants` is blind and stays blind. Nothing
 * in `src/lib/server/pairing/` may read `applicant_pii`.
 */
export const members = sqliteTable(
	'members',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		cycleId: integer('cycle_id')
			.notNull()
			.references(() => cycles.id),
		role: text('role', { enum: ['mentor', 'mentee'] }).notNull(),
		fullName: text('full_name').notNull(),
		email: text('email').notNull(),
		// Identity for programme operations (attendance being the driver):
		// a member must be identifiable without joining applicant_pii. Nullable
		// in the schema, populated by every import path in practice.
		studentId: text('student_id'),
		// Nullable: the mentor sign-up form does not collect industry, and the 9th
		// Circle encoded it in the name as a suffix. Roster import decides how it
		// gets populated for mentors.
		industry: text('industry'),
		// The application this member was promoted from, whichever role they
		// hold. Nullable because a batch can adopt the tool mid-programme, when
		// one role's applications predate the system — the 10th Circle's mentors
		// being exactly that case.
		applicantId: integer('applicant_id').references(() => applicants.id),
		// Contact handles, stored bare (no `@`, no URL): display and exports
		// build https://t.me/<telegram> and https://www.linkedin.com/in/<linkedin>.
		// Nullable: mentors predate the app's contact capture, and direct
		// mentee rows only have what the roster CSV provides.
		telegram: text('telegram'),
		linkedin: text('linkedin'),
		active: integer('active', { mode: 'boolean' }).notNull().default(true)
	},
	(t) => [
		unique('members_cycle_email').on(t.cycleId, t.email),
		unique('members_cycle_student').on(t.cycleId, t.studentId),
		index('members_roster').on(t.cycleId, t.role)
	]
);

// Members are not users: no password, no session cookie. The token in a
// member's link is itself the credential, checked fresh on every visit
// rather than redeemed once into a session (contrast `invites`/`sessions`).
export const memberTokens = sqliteTable('member_tokens', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	memberId: integer('member_id')
		.notNull()
		.references(() => members.id),
	tokenHash: text('token_hash').notNull().unique(),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull()
});

export const preferences = sqliteTable(
	'preferences',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		memberId: integer('member_id')
			.notNull()
			.references(() => members.id),
		choiceMemberId: integer('choice_member_id')
			.notNull()
			.references(() => members.id),
		rank: integer('rank').notNull(),
		reason: text('reason').notNull().default('')
	},
	(t) => [
		unique('preferences_member_rank').on(t.memberId, t.rank),
		unique('preferences_member_choice').on(t.memberId, t.choiceMemberId)
	]
);

export const pairings = sqliteTable(
	'pairings',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		cycleId: integer('cycle_id')
			.notNull()
			.references(() => cycles.id),
		mentorMemberId: integer('mentor_member_id')
			.notNull()
			.references(() => members.id),
		menteeMemberId: integer('mentee_member_id')
			.notNull()
			.references(() => members.id),
		// How this pair was arrived at. The 9th Circle's spreadsheet encoded this in
		// its sheet structure and lost it between TOTAL and FINAL.
		method: text('method', {
			enum: ['mutual_first', 'mutual_any', 'one_sided', 'manual']
		}).notNull(),
		overrideReason: text('override_reason'),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(t) => [
		unique('pairings_mentor').on(t.mentorMemberId),
		unique('pairings_mentee').on(t.menteeMemberId)
	]
);

/**
 * The pairing round's source of truth, saved each time the preference form
 * closes: every member's choices as submitted, plus what the algorithm made
 * of them with no manual overrides applied. Never updated or deleted, so
 * overrides can always be measured against it. The newest row per cycle
 * (highest id) is authoritative.
 */
export const pairingBaselines = sqliteTable('pairing_baselines', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	cycleId: integer('cycle_id')
		.notNull()
		.references(() => cycles.id),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`),
	createdBy: integer('created_by')
		.notNull()
		.references(() => users.id)
});

export const baselinePreferences = sqliteTable(
	'baseline_preferences',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		baselineId: integer('baseline_id')
			.notNull()
			.references(() => pairingBaselines.id),
		memberId: integer('member_id')
			.notNull()
			.references(() => members.id),
		choiceMemberId: integer('choice_member_id')
			.notNull()
			.references(() => members.id),
		rank: integer('rank').notNull(),
		reason: text('reason').notNull()
	},
	(t) => [unique('baseline_preferences_member_rank').on(t.baselineId, t.memberId, t.rank)]
);

export const baselinePairings = sqliteTable(
	'baseline_pairings',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		baselineId: integer('baseline_id')
			.notNull()
			.references(() => pairingBaselines.id),
		mentorMemberId: integer('mentor_member_id')
			.notNull()
			.references(() => members.id),
		menteeMemberId: integer('mentee_member_id')
			.notNull()
			.references(() => members.id),
		// The algorithm's own output only: a baseline never holds a manual pair.
		method: text('method', { enum: ['mutual_first', 'mutual_any', 'one_sided'] }).notNull(),
		// The rank each side gave the other, or null if they did not name them.
		mentorRank: integer('mentor_rank'),
		menteeRank: integer('mentee_rank')
	},
	(t) => [
		unique('baseline_pairings_mentor').on(t.baselineId, t.mentorMemberId),
		unique('baseline_pairings_mentee').on(t.baselineId, t.menteeMemberId)
	]
);

/**
 * Append-only record of every manual override. Live `pairings` only holds the
 * current state, so an override that is later replaced survives here.
 */
export const pairingOverrides = sqliteTable('pairing_overrides', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	cycleId: integer('cycle_id')
		.notNull()
		.references(() => cycles.id),
	baselineId: integer('baseline_id')
		.notNull()
		.references(() => pairingBaselines.id),
	mentorMemberId: integer('mentor_member_id')
		.notNull()
		.references(() => members.id),
	menteeMemberId: integer('mentee_member_id')
		.notNull()
		.references(() => members.id),
	reason: text('reason').notNull(),
	// Each member's live partner immediately before this override, or null if
	// they had none (or were already paired with each other).
	displacedMenteeId: integer('displaced_mentee_id').references(() => members.id),
	displacedMentorId: integer('displaced_mentor_id').references(() => members.id),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`),
	createdBy: integer('created_by')
		.notNull()
		.references(() => users.id)
});
