import { randomBytes } from 'node:crypto';

export const STAGING_TTL_MS = 30 * 60 * 1000;

export type UploadKind = 'applicants' | 'mentees' | 'mentors';

type Staged = { kind: UploadKind; payload: unknown; stagedAt: number };

/**
 * Uploaded files held between a wizard's validate and commit steps.
 *
 * In memory deliberately: the file is never written to disk, so an abandoned
 * upload leaves no applicant data behind, and a restart simply discards pending
 * stages — nothing was committed, and the admin still has the source file.
 * This mirrors the in-memory map in `auth/rateLimit.ts`.
 *
 * The kind tag is what makes the generic payload safe: a token staged for the
 * applicant wizard can never be read back as a roster payload, and a mentee
 * token can never be committed as mentors.
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

export function stageUpload<T>(kind: UploadKind, payload: T, now: number = Date.now()): string {
	// Sweeping on write bounds memory without a timer: an admin who uploads
	// repeatedly and never confirms cannot accumulate stale copies of the file.
	sweep(now);

	const token = randomBytes(32).toString('base64url');
	staged.set(token, { kind, payload, stagedAt: now });
	return token;
}

export function readStagedUpload<T>(
	kind: UploadKind,
	token: string,
	now: number = Date.now()
): T | null {
	const entry = staged.get(token);
	if (!entry || entry.kind !== kind) return null;

	if (now - entry.stagedAt > STAGING_TTL_MS) {
		staged.delete(token);
		return null;
	}

	return entry.payload as T;
}

export function discardStagedUpload(token: string): void {
	staged.delete(token);
}

/** Test-only: drop every staged upload. */
export function resetStagingForTesting(): void {
	staged.clear();
}
