import { and, eq, inArray } from 'drizzle-orm';
import type { AppDb } from '../db';
import { members, preferences } from '../db/schema';
import { normalizeHeader } from '../import/columns';
import type { ParsedCsv } from '../import/parse';
import { getFormStatus } from './form';
import { setPreferences, type ChoiceInput } from './preferences';
import {
	duplicateNames,
	headerKey,
	normalizeAdminId,
	normalizeName,
	parseRole,
	type ResponseRole
} from './responseNormalize';

const ROLES: ResponseRole[] = ['mentor', 'mentee'];
const OPPOSITE: Record<ResponseRole, ResponseRole> = { mentor: 'mentee', mentee: 'mentor' };

const FIXED = {
	timestamp: 'timestamp',
	name: 'full name',
	email: 'school email address',
	adminId: 'school admin id',
	role: 'i am a...'
} as const;

/** Added by Google when the form collects verified addresses. Used if present, never required. */
const OPTIONAL = { signedInEmail: 'email address' } as const;

const ORDINALS = ['first', 'second', 'third'];

/** Mentors choose mentees and mentees choose mentors, in separate form sections. */
const CHOICE_HEADERS: Record<ResponseRole, { choice: string; reason: string }[]> = {
	mentor: ORDINALS.map((o) => ({
		choice: `${o} choice of mentee`,
		reason: `reason for ${o} choice of mentee`
	})),
	mentee: ORDINALS.map((o) => ({
		choice: `${o} choice of mentor`,
		reason: `reason for ${o} choice of mentor`
	}))
};

const REQUIRED_HEADERS: string[] = [
	...Object.values(FIXED),
	...ROLES.flatMap((r) => CHOICE_HEADERS[r].flatMap((h) => [h.choice, h.reason]))
];

export type ResponseIssue = { response: number; who: string; message: string };

export type ResponsesReport = {
	rowCount: number;
	missingHeaders: string[];
	unmappedHeaders: string[];
	ambiguousNames: { role: ResponseRole; name: string; count: number }[];
	toImport: number;
	toReplace: number;
	superseded: number;
	errors: ResponseIssue[];
	warnings: ResponseIssue[];
	notYetSubmitted: string[];
	blocking: string[];
};

export type ResponsesPlan = { memberId: number; choices: ChoiceInput[] }[];

type RosterMember = {
	id: number;
	role: ResponseRole;
	fullName: string;
	email: string;
	studentId: string | null;
};

/**
 * Read-only: everything wrong with a Google Form export that can be seen from the file
 * and the roster, plus the plan a commit would apply. Nothing is written.
 */
export function previewResponses(
	db: AppDb,
	cycleId: number,
	parsed: ParsedCsv
): { report: ResponsesReport; plan: ResponsesPlan } {
	const report: ResponsesReport = {
		rowCount: parsed.rows.length,
		missingHeaders: [],
		unmappedHeaders: [],
		ambiguousNames: [],
		toImport: 0,
		toReplace: 0,
		superseded: 0,
		errors: [],
		warnings: [],
		notYetSubmitted: [],
		blocking: []
	};
	const plan: ResponsesPlan = [];

	// header key -> the key parseCsv stored each row's cells under
	const keyOf = new Map<string, string>();
	for (const header of parsed.headers) keyOf.set(headerKey(header), normalizeHeader(header));

	report.missingHeaders = REQUIRED_HEADERS.filter((h) => !keyOf.has(h));
	const known = new Set([...REQUIRED_HEADERS, OPTIONAL.signedInEmail]);
	// A consent question's title can be a whole paragraph, so only its opening is shown.
	report.unmappedHeaders = parsed.headers
		.filter((h) => headerKey(h) !== '' && !known.has(headerKey(h)))
		.map((h) => {
			const flat = h.replace(/\s+/g, ' ').trim();
			return flat.length > 60 ? `${flat.slice(0, 57)}...` : flat;
		});
	if (report.missingHeaders.length > 0) {
		report.blocking.push(`Missing columns: ${report.missingHeaders.join(', ')}.`);
	}

	const roster: RosterMember[] = db
		.select({
			id: members.id,
			role: members.role,
			fullName: members.fullName,
			email: members.email,
			studentId: members.studentId
		})
		.from(members)
		.where(and(eq(members.cycleId, cycleId), eq(members.active, true)))
		.all();

	for (const role of ROLES) {
		const names = roster.filter((m) => m.role === role).map((m) => m.fullName);
		for (const dup of duplicateNames(names)) {
			report.ambiguousNames.push({ role, ...dup });
			report.blocking.push(
				`${dup.count} ${role}s share the name "${dup.name}". Make the names distinct in the roster, then upload again.`
			);
		}
	}
	if (report.blocking.length > 0) return { report, plan };

	// Two roster IDs can normalise to one key (a stripped leading zero, a different case).
	// Neither is a safe match, so a response typing that ID is reported instead.
	const byAdminId = new Map<string, RosterMember>();
	const collidingIds = new Set<string>();
	for (const m of roster) {
		if (!m.studentId) continue;
		const key = normalizeAdminId(m.studentId);
		if (byAdminId.has(key)) collidingIds.add(key);
		byAdminId.set(key, m);
	}

	const byName: Record<ResponseRole, Map<string, RosterMember>> = {
		mentor: new Map(),
		mentee: new Map()
	};
	for (const m of roster) byName[m.role].set(normalizeName(m.fullName), m);

	const hasExisting = new Set(
		roster.length === 0
			? []
			: db
					.select({ memberId: preferences.memberId })
					.from(preferences)
					.where(
						inArray(
							preferences.memberId,
							roster.map((m) => m.id)
						)
					)
					.all()
					.map((r) => r.memberId)
	);

	const cell = (row: Record<string, string>, header: string): string =>
		(keyOf.has(header) ? (row[keyOf.get(header)!] ?? '') : '').trim();

	// Last row per respondent wins, by position in the file.
	const latest = new Map<number, { response: number; row: Record<string, string> }>();
	parsed.rows.forEach((row, index) => {
		const response = index + 1;
		const typedId = cell(row, FIXED.adminId);
		const typedKey = typedId ? normalizeAdminId(typedId) : '';
		const who = cell(row, FIXED.name) || '(no name)';
		if (collidingIds.has(typedKey)) {
			report.errors.push({
				response,
				who,
				message: `School Admin ID "${typedId}" matches more than one roster member.`
			});
			return;
		}
		const member = typedId ? byAdminId.get(typedKey) : undefined;
		if (!member) {
			report.errors.push({
				response,
				who,
				message: typedId
					? `School Admin ID "${typedId}" is not on the roster.`
					: 'School Admin ID is blank.'
			});
			return;
		}
		if (latest.has(member.id)) report.superseded += 1;
		latest.set(member.id, { response, row });
	});

	const rosterById = new Map(roster.map((m) => [m.id, m]));
	const ordered = [...latest.entries()].sort((a, b) => a[1].response - b[1].response);
	const planned = new Set<number>();

	for (const [memberId, { response, row }] of ordered) {
		const member = rosterById.get(memberId)!;
		const who = member.fullName;
		const problems: string[] = [];

		const typedName = cell(row, FIXED.name);
		if (typedName && normalizeName(typedName) !== normalizeName(member.fullName)) {
			report.warnings.push({
				response,
				who,
				message: `Typed name "${typedName}" differs from the roster.`
			});
		}
		const typedEmail = cell(row, FIXED.email);
		if (typedEmail && typedEmail.toLowerCase() !== member.email.toLowerCase()) {
			report.warnings.push({
				response,
				who,
				message: `Typed email "${typedEmail}" differs from the roster.`
			});
		}
		// Present only when the form collects verified addresses. A warning, not an error:
		// school addresses can differ by faculty subdomain.
		const signedIn = cell(row, OPTIONAL.signedInEmail);
		if (signedIn && signedIn.toLowerCase() !== member.email.toLowerCase()) {
			report.warnings.push({
				response,
				who,
				message: `Signed-in email "${signedIn}" differs from the roster.`
			});
		}

		const stated = parseRole(cell(row, FIXED.role));
		if (!stated) problems.push('"I am a..." must be Mentor or Mentee.');
		else if (stated !== member.role) {
			problems.push(`They answered as a ${stated}, but the roster lists them as a ${member.role}.`);
		}

		const choices: ChoiceInput[] = [];
		if (problems.length === 0) {
			const target = OPPOSITE[member.role];
			CHOICE_HEADERS[member.role].forEach((h, index) => {
				const rank = (index + 1) as 1 | 2 | 3;
				const name = cell(row, h.choice);
				if (!name) {
					problems.push(`Rank ${rank} choice is blank.`);
					return;
				}
				const hit = byName[target].get(normalizeName(name));
				if (!hit) {
					problems.push(`Rank ${rank} choice "${name}" is not on the ${target} roster.`);
					return;
				}
				choices.push({ rank, choiceMemberId: hit.id, reason: cell(row, h.reason) });
			});
			if (
				problems.length === 0 &&
				new Set(choices.map((c) => c.choiceMemberId)).size !== choices.length
			) {
				problems.push('The same person is chosen more than once.');
			}
		}

		if (problems.length > 0) {
			const kept = hasExisting.has(memberId) ? ' Their existing choices were kept.' : '';
			for (const message of problems)
				report.errors.push({ response, who, message: message + kept });
			continue;
		}

		plan.push({ memberId, choices });
		planned.add(memberId);
		if (hasExisting.has(memberId)) report.toReplace += 1;
	}

	report.toImport = plan.length;
	report.notYetSubmitted = roster
		.filter((m) => !planned.has(m.id) && !hasExisting.has(m.id))
		.map((m) => m.fullName)
		.sort((a, b) => a.localeCompare(b));

	if (plan.length === 0) report.blocking.push('No valid responses to import.');

	return { report, plan };
}

export class ResponsesError extends Error {
	constructor(
		readonly code: 'closed' | 'blocked',
		message: string
	) {
		super(message);
		this.name = 'ResponsesError';
	}
}

export type CommitSummary = { imported: number; replaced: number };

/**
 * Apply a file's plan, all or nothing. The preview is re-run here on the text the
 * caller staged, so a roster that changed since validation is judged as it is now.
 */
export function commitResponses(db: AppDb, cycleId: number, parsed: ParsedCsv): CommitSummary {
	if (getFormStatus(db, cycleId) === 'closed') {
		throw new ResponsesError('closed', 'The preference form is closed.');
	}

	const { report, plan } = previewResponses(db, cycleId, parsed);
	if (report.blocking.length > 0) {
		throw new ResponsesError('blocked', report.blocking.join(' '));
	}

	db.transaction((tx) => {
		for (const entry of plan) setPreferences(tx, entry.memberId, entry.choices);
	});

	return { imported: plan.length, replaced: report.toReplace };
}
