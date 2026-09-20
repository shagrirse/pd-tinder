import { asc, eq } from 'drizzle-orm';
import type { AppDb } from '../db';
import { members } from '../db/schema';

export type RosterRow = {
	id: number;
	fullName: string;
	email: string;
	industry: string | null;
	studentId: string | null;
	applicantId: number | null;
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
			applicantId: members.applicantId
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
