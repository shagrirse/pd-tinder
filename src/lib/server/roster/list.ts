import { and, asc, eq } from 'drizzle-orm';
import type { AppDb } from '../db';
import { members } from '../db/schema';

export type RosterRow = {
	id: number;
	fullName: string;
	email: string;
	industry: string | null;
	studentId: string | null;
	applicantId: number | null;
	telegram: string | null;
	linkedin: string | null;
};

export type RosterSummary = {
	cycleId: number;
	mentors: RosterRow[];
	mentees: RosterRow[];
};

/** The current roster of one cycle, each role ordered by name. */
export function listRoster(db: AppDb, cycleId: number): RosterSummary {
	const rows = db
		.select({
			id: members.id,
			role: members.role,
			fullName: members.fullName,
			email: members.email,
			industry: members.industry,
			studentId: members.studentId,
			applicantId: members.applicantId,
			telegram: members.telegram,
			linkedin: members.linkedin
		})
		.from(members)
		.where(eq(members.cycleId, cycleId))
		.orderBy(asc(members.fullName))
		.all();

	const mentors: RosterRow[] = [];
	const mentees: RosterRow[] = [];
	for (const { role, ...row } of rows) {
		(role === 'mentor' ? mentors : mentees).push(row);
	}

	return { cycleId, mentors, mentees };
}

/**
 * The active roster of one role, grouped for display by industry then name.
 * Used to offer choices on the preference form — inactive members are never
 * a valid choice (`setPreferences` rejects them), so they are excluded here
 * rather than shown and then bounced at submission.
 */
export function listActiveRoster(
	db: AppDb,
	cycleId: number,
	role: 'mentor' | 'mentee'
): RosterRow[] {
	return db
		.select({
			id: members.id,
			fullName: members.fullName,
			email: members.email,
			industry: members.industry,
			studentId: members.studentId,
			applicantId: members.applicantId,
			telegram: members.telegram,
			linkedin: members.linkedin
		})
		.from(members)
		.where(and(eq(members.cycleId, cycleId), eq(members.role, role), eq(members.active, true)))
		.orderBy(asc(members.industry), asc(members.fullName))
		.all();
}
