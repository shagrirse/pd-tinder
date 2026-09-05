import { randomBytes } from 'node:crypto';

export const STAGING_TTL_MS = 30 * 60 * 1000;

type Staged = { csvText: string; cycleId: number; stagedAt: number };

/**
 * Uploaded files held between the wizard's validate and commit steps.
 *
 * In memory deliberately: the file is never written to disk, so an abandoned
 * upload leaves no applicant data behind, and a restart simply discards pending
 * stages — nothing was committed, and the admin still has the source file. This
 * mirrors the in-memory map in `auth/rateLimit.ts`.
 *
 * Single-instance assumption: a stage lives only in this process's memory, so a
 * validate on one server instance and a commit on another would never find it.
 * That matches the current single-instance SQLite deployment, but must be
 * revisited before the app is ever scaled out.
 */
const staged = new Map<string, Staged>();

function sweep(now: number): void {
	for (const [token, entry] of staged) {
		if (now - entry.stagedAt > STAGING_TTL_MS) staged.delete(token);
	}
}

export function stageImport(csvText: string, cycleId: number, now: number = Date.now()): string {
	// Sweeping on write bounds memory without a timer: an admin who uploads
	// repeatedly and never confirms cannot accumulate stale copies of the file.
	sweep(now);

	const token = randomBytes(32).toString('base64url');
	staged.set(token, { csvText, cycleId, stagedAt: now });
	return token;
}

export function readStagedImport(
	token: string,
	now: number = Date.now()
): { csvText: string; cycleId: number } | null {
	const entry = staged.get(token);
	if (!entry) return null;

	if (now - entry.stagedAt > STAGING_TTL_MS) {
		staged.delete(token);
		return null;
	}

	return { csvText: entry.csvText, cycleId: entry.cycleId };
}

export function discardStagedImport(token: string): void {
	staged.delete(token);
}

/** Test-only: drop every staged upload. */
export function resetStagingForTesting(): void {
	staged.clear();
}
