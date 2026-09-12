/**
 * Build the anonymised 9th Circle replay fixture.
 *
 * Local, one-off tooling. The source workbooks and the name-alias CSV contain
 * PII and are gitignored; only the anonymised output is committed. Run:
 *
 *   npx tsx scripts/pairing-fixture/build.ts \
 *     --responses "<preference form responses>.xlsx" \
 *     --working "<PD working copy>.xlsx" \
 *     --aliases "<pairing-name-aliases.csv>" \
 *     --out tests/fixtures/pairing-9th-circle.json
 *
 * --aliases points at a gitignored CSV in the main checkout, next to the
 * source workbooks: header "raw,roster", one row per PD-confirmed name
 * mapping. It holds applicant PII and the remote is public, so it must never
 * be committed. Without the flag the alias table is empty and every unmatched
 * name trips the adjudication gate.
 *
 * The fixture carries stable integer ids and nothing else about a person: no
 * names, no emails, no free-text reasons (spec §7.1).
 *
 * If any name cannot be resolved to a roster member, this prints the unresolved
 * names and exits non-zero. That list is for a human to adjudicate — never guess
 * a mapping, and never drop a person to make the script pass.
 */
import { writeFileSync } from 'node:fs';
// Default import, not `import * as XLSX`: the xlsx package's CJS build doesn't
// expose `readFile` as a statically-analysable named export under Node ESM, so
// a namespace import silently yields `XLSX.readFile === undefined`.
import XLSX from 'xlsx';
import { normalizeIndustry } from '../../src/lib/server/import/normalize';
import { normalizeName } from './normalize-name';

function argValue(flag: string): string | null {
	const index = process.argv.indexOf(flag);
	if (index === -1) return null;
	const next = process.argv[index + 1];
	if (next === undefined || next.startsWith('--')) return null;
	return next;
}

const responsesPath = argValue('--responses');
const workingPath = argValue('--working');
const aliasesPath = argValue('--aliases');
const outPath = argValue('--out') ?? 'tests/fixtures/pairing-9th-circle.json';

if (!responsesPath || !workingPath) {
	console.error('Usage: --responses <xlsx> --working <xlsx> [--aliases <csv>] [--out <json>]');
	process.exit(1);
}

/**
 * PD-confirmed name mappings ("raw name as typed" -> "roster name"), loaded
 * from the gitignored alias CSV in the main checkout (see the file header).
 * Confirmed by the PD team on 2026-09-13, never inferred. When --aliases is
 * absent the table is empty and every unmatched name trips the adjudication
 * gate — the intended degradation.
 */
const NAME_ALIASES: Record<string, string> = aliasesPath ? aliasesFromCsv(aliasesPath) : {};

type Row = Record<string, unknown>;

function sheet(path: string, name: string): Row[] {
	const book = XLSX.readFile(path);
	const found = book.SheetNames.find((s) => s.toLowerCase() === name.toLowerCase());
	if (!found) {
		console.error(`Sheet "${name}" not found in ${path}. Sheets: ${book.SheetNames.join(', ')}`);
		process.exit(1);
	}
	return XLSX.utils.sheet_to_json<Row>(book.Sheets[found], { defval: '' });
}

function gridSheet(path: string, name: string): unknown[][] {
	const book = XLSX.readFile(path);
	const found = book.SheetNames.find((s) => s.toLowerCase() === name.toLowerCase());
	if (!found) {
		console.error(`Sheet "${name}" not found in ${path}. Sheets: ${book.SheetNames.join(', ')}`);
		process.exit(1);
	}
	return XLSX.utils.sheet_to_json(book.Sheets[found], { header: 1, defval: '' }) as unknown[][];
}

function aliasesFromCsv(path: string): Record<string, string> {
	const book = XLSX.readFile(path);
	const rows = XLSX.utils.sheet_to_json<{ raw: string; roster: string }>(book.Sheets[book.SheetNames[0]], {
		defval: ''
	});
	const aliases: Record<string, string> = {};
	for (const row of rows) {
		const raw = String(row.raw ?? '').trim();
		if (raw !== '') aliases[raw] = String(row.roster ?? '').trim();
	}
	return aliases;
}

function text(row: Row, ...candidates: string[]): string {
	for (const key of Object.keys(row)) {
		const normalised = key.trim().toLowerCase();
		if (candidates.some((c) => normalised.includes(c.toLowerCase()))) {
			return String(row[key] ?? '').trim();
		}
	}
	return '';
}

// --- 1. Build the roster and assign stable ids ------------------------------
// Mentors first, then mentees, each in the order the responses workbook lists
// them, so ids are stable across rebuilds.
//
// Adapted from the brief: the working copy's "Mentor (All)" / "Mentee (All)"
// sheets are actually the full respondent pool for that role's question set
// (62 and 70 rows, mixing both roles per the "I am a..." column) rather than a
// roster, so their row counts don't match spec §2.4's 35/35. The responses
// workbook's "Mentors" / "Mentees" sheets are the real roster (35 rows each,
// with a clean Industry/Name/Email shape) and are used instead.

const roster = new Map<string, { id: number; role: 'mentor' | 'mentee'; industry: string | null }>();
let nextId = 1;

function addToRoster(rawName: string, role: 'mentor' | 'mentee', industry: string | null): void {
	const { key } = normalizeName(rawName);
	if (key === '') return;
	const existing = roster.get(key);
	if (existing) {
		if (!existing.industry && industry) existing.industry = industry;
		return;
	}
	roster.set(key, { id: nextId++, role, industry });
}

for (const row of sheet(responsesPath, 'Mentors')) {
	addToRoster(text(row, 'name'), 'mentor', normalizeIndustry(text(row, 'industry')));
}
for (const row of sheet(responsesPath, 'Mentees')) {
	addToRoster(text(row, 'name'), 'mentee', normalizeIndustry(text(row, 'industry')));
}

// --- 2. Resolve every name mentioned anywhere -------------------------------

const unresolved = new Set<string>();

function resolve(rawName: string): number | null {
	const alias = NAME_ALIASES[rawName.trim()];
	const { key } = normalizeName(alias ?? rawName);
	if (key === '') return null;
	const hit = roster.get(key);
	if (hit) return hit.id;
	unresolved.add(rawName.trim());
	return null;
}

// --- 3. Preferences ---------------------------------------------------------
//
// Adapted from the brief: the real column headings spell ordinals out ("First
// Choice for Mentee") rather than using "1st"/"2nd"/"3rd", and each response
// row carries both a mentor's and a mentee's choice columns side by side, only
// one set of which is filled in depending on the respondent's own role (the
// "I am a..." column). A blank-named row is a spreadsheet padding row (the
// workbook also has 69 of these, one of which is the "62 in the role field"
// anomaly from spec §2.5), not a submission, and is skipped by the blank-key
// check in resolve() the same way the brief's version already relied on.

const ORDINALS = ['first', 'second', 'third'];

const preferences: { memberId: number; rank: number; choiceMemberId: number }[] = [];
let submissions = 0;

for (const row of sheet(responsesPath, 'Form responses 1')) {
	const self = resolve(text(row, 'your full matriculated name', 'name'));
	if (self === null) continue;
	const ownRole = text(row, 'i am a').toLowerCase();
	const targetRole = ownRole === 'mentor' ? 'mentee' : ownRole === 'mentee' ? 'mentor' : null;
	if (targetRole === null) continue;
	submissions += 1;
	for (const rank of [1, 2, 3]) {
		const choiceRaw = text(row, `${ORDINALS[rank - 1]} choice for ${targetRole}`);
		const choice = resolve(choiceRaw);
		if (choice !== null) preferences.push({ memberId: self, rank, choiceMemberId: choice });
	}
}

// --- 4. The pairs PD actually shipped ---------------------------------------
//
// Adapted from the brief: the shipped pairing is the working copy's "Mentor
// Alphabetical" sheet — a single clean table (headers "Mentor"/"Mentee" at
// row 0, 35 data rows, no footers). The PD team confirmed on 2026-09-13 that
// this sheet is the final mentor-mentee pairing; it is set-equal to the FINAL
// sheet's two side-by-side tables combined (spec §2.5: 70 names across FINAL
// = 35 pairs).
//
// The 5 pairs in TOTAL's block labelled "< didnt get any of their choices"
// mark the members the automated passes could not satisfy. That label
// describes the algorithm-stage outcome, not the shipped result — one of
// those members landed her #1-ranked mentor in the final pairing. The block
// is therefore read only to derive the hand-resolved MEMBER SET (both members
// of each block pair), never the pairing itself.

function isFooterRow(raw: string): boolean {
	return raw === '' || /^\d+$/.test(raw) || raw.toLowerCase() === 'total';
}

const final: { mentorId: number; menteeId: number }[] = [];
const handResolved: number[] = [];

function addFinalPair(mentorRaw: string, menteeRaw: string): void {
	if (isFooterRow(mentorRaw) || isFooterRow(menteeRaw)) return;
	const mentorId = resolve(mentorRaw);
	const menteeId = resolve(menteeRaw);
	if (mentorId === null || menteeId === null) return;
	final.push({ mentorId, menteeId });
}

for (const row of sheet(workingPath, 'Mentor Alphabetical')) {
	addFinalPair(String(row['Mentor'] ?? '').trim(), String(row['Mentee'] ?? '').trim());
}

const totalGrid = gridSheet(workingPath, 'TOTAL');
let labelRow = -1;
let labelCol = -1;
for (let r = 0; r < totalGrid.length && labelRow === -1; r++) {
	for (let c = 0; c < totalGrid[r].length; c++) {
		const cell = String(totalGrid[r][c] ?? '').toLowerCase();
		if (cell.includes('didnt get any') || cell.includes("didn't get any")) {
			labelRow = r;
			labelCol = c;
			break;
		}
	}
}
if (labelCol < 2) {
	console.error(`"< didnt get any of their choices" block not found in TOTAL of ${workingPath}.`);
	process.exit(1);
}
for (let r = labelRow + 1; r < totalGrid.length; r++) {
	const mentorRaw = String(totalGrid[r][labelCol - 2] ?? '').trim();
	const menteeRaw = String(totalGrid[r][labelCol - 1] ?? '').trim();
	if (isFooterRow(mentorRaw) || isFooterRow(menteeRaw)) break;
	const mentorId = resolve(mentorRaw);
	const menteeId = resolve(menteeRaw);
	if (mentorId !== null && menteeId !== null) handResolved.push(mentorId, menteeId);
}

// --- 5. Adjudication gate ---------------------------------------------------

if (unresolved.size > 0) {
	console.error(`\n${unresolved.size} name(s) could not be resolved to a roster member:\n`);
	for (const name of [...unresolved].sort()) console.error(`  - ${name}`);
	console.error(
		'\nThese are the nickname and typo cases from spec §2.5. Decide each one by hand,\n' +
			'add it to the alias CSV (--aliases), and re-run. Do not drop anyone.\n'
	);
	process.exit(1);
}

// --- 6. Emit ----------------------------------------------------------------

const members = [...roster.values()]
	.map(({ id, role, industry }) => ({ id, role, industry }))
	.sort((a, b) => a.id - b.id);

const fixture = {
	source: '9th Circle',
	members,
	preferences: preferences.sort((a, b) => a.memberId - b.memberId || a.rank - b.rank),
	final: final.sort((a, b) => a.mentorId - b.mentorId),
	handResolved: [...new Set(handResolved)].sort((a, b) => a - b),
	expected: {
		note: "Figures observed when the fixture was built. Written from this script's output, never invented.",
		members: members.length,
		submissions,
		finalPairs: final.length,
		unjoinable: 0
	}
};

writeFileSync(outPath, `${JSON.stringify(fixture, null, '\t')}\n`);

console.log(`Wrote ${outPath}`);
console.log(`  members:     ${members.length}`);
console.log(`  submissions: ${submissions}`);
console.log(`  preferences: ${preferences.length}`);
console.log(`  final pairs: ${final.length}`);
console.log(`  hand-resolved members: ${fixture.handResolved.length}`);
