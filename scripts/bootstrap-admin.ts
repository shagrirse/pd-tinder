/**
 * Create the first administrator on a deployed instance.
 *
 * On the server:
 *   docker compose exec app npx tsx scripts/bootstrap-admin.ts \
 *     --name "Danzel Tan" --email danzel@example.com
 *
 * Safe to re-run: if any account already exists it writes nothing and says so.
 * No password is set here — the printed invite link is how the administrator
 * chooses one.
 */
import { getDb } from '../src/lib/server/db/instance';
import { bootstrapAdmin, type BootstrapResult } from '../src/lib/server/admin/bootstrap';

function argValue(flag: string): string | null {
	const index = process.argv.indexOf(flag);
	if (index === -1) return null;
	const value = process.argv[index + 1];
	// A flag cannot be a value; `--name --email x@y.z` is a missing name, not a
	// literal "--email".
	if (value === undefined || value.startsWith('--')) return null;
	return value;
}

const name = argValue('--name');
const email = argValue('--email');

if (!name || !email) {
	console.error(
		'Usage: tsx scripts/bootstrap-admin.ts --name "Full Name" --email someone@example.com'
	);
	process.exit(1);
}

// getDb() migrates a fresh database on open, so this works on a brand new instance.
let result: BootstrapResult | null;
try {
	result = bootstrapAdmin(getDb(), { name, email });
} catch (error) {
	// A validation failure (or a busy database under BEGIN IMMEDIATE) is an
	// operator problem worth one line, not a stack trace.
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}

if (result === null) {
	console.log('An account already exists, so nothing was written.');
	console.log('To add more people, sign in as an administrator and use /admin/people.');
	process.exit(0);
}

const origin = process.env.ORIGIN ?? '';
const link = origin ? `${origin}/invite/${result.token}` : `/invite/${result.token}`;

console.log(`Created administrator "${name}" <${email}>.`);
console.log('');
console.log('Open this link to choose a password. It is shown once and expires in 7 days:');
console.log(`  ${link}`);

if (!origin) {
	console.log('');
	console.log('ORIGIN is not set, so the link above is a path rather than a full URL.');
}
