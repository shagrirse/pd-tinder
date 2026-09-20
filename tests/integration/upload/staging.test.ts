import { beforeEach, describe, expect, it } from 'vitest';
import {
	STAGING_TTL_MS,
	discardStagedUpload,
	readStagedUpload,
	resetStagingForTesting,
	stageUpload
} from '../../../src/lib/server/upload/staging';

type Payload = { csvText: string; cycleId: number };

beforeEach(() => resetStagingForTesting());

describe('upload staging', () => {
	it('round-trips a staged payload by token and kind', () => {
		const token = stageUpload('applicants', { csvText: 'a,b\n1,2\n', cycleId: 7 });
		expect(readStagedUpload<Payload>('applicants', token)).toEqual({
			csvText: 'a,b\n1,2\n',
			cycleId: 7
		});
	});

	it('returns null when the kind does not match the staged payload', () => {
		const token = stageUpload('mentees', { csvText: 'x', cycleId: 1 });
		expect(readStagedUpload<Payload>('mentors', token)).toBeNull();
		expect(readStagedUpload<Payload>('applicants', token)).toBeNull();
	});

	it('returns null when the kind matches but the token was staged under another kind', () => {
		// A token staged by the applicant wizard must never read as a roster payload.
		const token = stageUpload('applicants', { csvText: 'x', cycleId: 1 });
		expect(readStagedUpload<Payload>('mentors', token)).toBeNull();
	});

	it('issues a different token each time', () => {
		expect(stageUpload('applicants', { csvText: 'x', cycleId: 1 })).not.toBe(
			stageUpload('applicants', { csvText: 'x', cycleId: 1 })
		);
	});

	it('returns null for an unknown token', () => {
		expect(readStagedUpload<Payload>('applicants', 'nonsense')).toBeNull();
	});

	it('returns null once the stage has expired', () => {
		const start = 1_000_000;
		const token = stageUpload('applicants', { csvText: 'x', cycleId: 1 }, start);
		expect(readStagedUpload<Payload>('applicants', token, start + STAGING_TTL_MS + 1)).toBeNull();
	});

	it('still returns a stage inside its TTL', () => {
		const start = 1_000_000;
		const token = stageUpload('applicants', { csvText: 'x', cycleId: 1 }, start);
		expect(
			readStagedUpload<Payload>('applicants', token, start + STAGING_TTL_MS - 1)
		).not.toBeNull();
	});

	it('discards a stage', () => {
		const token = stageUpload('applicants', { csvText: 'x', cycleId: 1 });
		discardStagedUpload(token);
		expect(readStagedUpload<Payload>('applicants', token)).toBeNull();
	});

	it('sweeps expired stages so they cannot accumulate', () => {
		const start = 1_000_000;
		const stale = stageUpload('applicants', { csvText: 'old', cycleId: 1 }, start);
		stageUpload('applicants', { csvText: 'new', cycleId: 1 }, start + STAGING_TTL_MS + 1);
		expect(readStagedUpload<Payload>('applicants', stale, start + STAGING_TTL_MS + 1)).toBeNull();
	});

	it('keeps separate stages independent', () => {
		const first = stageUpload('mentees', { csvText: 'one', cycleId: 1 });
		const second = stageUpload('mentors', { csvText: 'two', cycleId: 2 });
		expect(readStagedUpload<Payload>('mentees', first)!.csvText).toBe('one');
		expect(readStagedUpload<Payload>('mentors', second)!.cycleId).toBe(2);
	});
});
