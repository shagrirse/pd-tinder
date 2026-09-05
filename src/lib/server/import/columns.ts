export function normalizeHeader(raw: string): string {
	return raw.replace(/\s+/g, ' ').trim().toLowerCase();
}

export const QUESTION_KEYS = [
	'q_why_tmc',
	'q_ideal_catchup',
	'q_goals',
	'q_feedback',
	'q_helped_someone',
	'q_challenge',
	'q_commitments',
	'q_time_management',
	'q_key_events'
] as const;

export type QuestionKey = (typeof QUESTION_KEYS)[number];

/** Every question except the key-events answer, which is shown as context but never rated. */
export const RATED_QUESTION_KEYS = QUESTION_KEYS.filter(
	(k) => k !== 'q_key_events'
) as Exclude<QuestionKey, 'q_key_events'>[];

export const QUESTION_PROMPTS: Record<QuestionKey, string> = {
	q_why_tmc: 'Why would you like to join TMC as a mentee?',
	q_ideal_catchup: 'Explain how an ideal catchup with your mentor is like for you.',
	q_goals: 'Short-term and long-term goals, and current progress.',
	q_feedback: 'An instance when you received critical feedback, and how you reacted.',
	q_helped_someone: 'An instance where you helped someone grow or solve a problem.',
	q_challenge: 'A significant academic or personal challenge, and how you overcame it.',
	q_commitments: 'Potential commitments for the coming academic year.',
	q_time_management: 'How you plan to manage time between TMC and other commitments.',
	q_key_events: 'Reason for being unable to attend key events.'
};

export const META_FIELD_KEYS = [
	'timestamp',
	'email',
	'full_name',
	'gender',
	'student_id',
	'smu_email',
	'industry_1',
	'industry_2',
	'faculty',
	'faculty_2',
	'contact_number',
	'telegram',
	'linkedin',
	'prior_mentee'
] as const;

/** Without these an applicant cannot be identified, pooled, or reviewed. */
export const REQUIRED_FIELD_KEYS = [
	'full_name',
	'email',
	'student_id',
	'industry_1',
	'linkedin',
	...QUESTION_KEYS
] as const;

export const DEFAULT_COLUMN_MAPPING: Record<string, string> = {
	timestamp: 'timestamp',
	'email address': 'email',
	'full matriculated name': 'full_name',
	gender: 'gender',
	'smu student id (01234856)': 'student_id',
	'smu email address (primary faculty)': 'smu_email',
	'which is your first industry choice?': 'industry_1',
	'which is your second industry choice?': 'industry_2',
	'primary faculty': 'faculty',
	'secondary faculty (if applicable)': 'faculty_2',
	'contact number': 'contact_number',
	'telegram username': 'telegram',
	'linkedin profile link': 'linkedin',
	'have you been a mentee in tmc before?': 'prior_mentee',
	'why would you like to join tmc as a mentee?': 'q_why_tmc',
	'explain how an ideal catchup with your mentor is like for you.': 'q_ideal_catchup',
	'can you share 1-2 of your short-term and long-term goals respectively, and your current progress on them thus far?':
		'q_goals',
	'can you describe an instance when you received critical feedback? how did you react?':
		'q_feedback',
	'share an instance where you helped someone grow or solve a problem.': 'q_helped_someone',
	'can you describe a time when you faced a significant academic or personal challenge? how did you approach overcoming it?':
		'q_challenge',
	'what are your potential commitments for the coming academic year? e.g. ccas, internship, academic, exchange.':
		'q_commitments',
	'how do you plan on managing the time spent for tmc and your other commitments?':
		'q_time_management',
	'if you unable to attend any of our key events listed below, please share your reason. otherwise, type "nil"':
		'q_key_events'
};
