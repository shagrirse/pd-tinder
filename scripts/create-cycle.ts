/**
 * Create the review cycle on a deployed instance.
 *
 * On the server:
 *   docker compose exec app npx tsx scripts/create-cycle.ts \
 *     --name "Mentee Recruitment 2026" --year 2026
 *
 * Safe to re-run: if a reviewing cycle already exists it writes nothing and
 * says so. Never wipes anything — that is the difference between this and
 * scripts/seed-dev.ts, which must never run on the server.
 */
import { getDb } from '../src/lib/server/db/instance';
import { createCycle } from '../src/lib/server/admin/cycle';

function argValue(flag: string): string | null {
	const index = process.argv.indexOf(flag);
	if (index === -1) return null;
	const next = process.argv[index + 1];
	if (next === undefined || next.startsWith('--')) return null;
	return next;
}

const name = argValue('--name');
const yearArg = argValue('--year');

if (!name || !yearArg) {
	console.error(
		'Usage: tsx scripts/create-cycle.ts --name "Mentee Recruitment 2026" --year 2026'
	);
	process.exit(1);
}

try {
	const year = Number(yearArg);
	const result = createCycle(getDb(), { name, year });

	if (result === null) {
		console.log('A reviewing cycle already exists, so nothing was written.');
		process.exit(0);
	}

	console.log(`Created cycle "${result.name}" (${result.year}, id ${result.cycleId}).`);
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}
