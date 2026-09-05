import { beforeEach, describe, expect, it } from 'vitest';
import {
	STAGING_TTL_MS,
	discardStagedImport,
	readStagedImport,
	resetStagingForTesting,
	stageImport
} from '../../../src/lib/server/import/staging';

beforeEach(() => resetStagingForTesting());

describe('import staging', () => {
	it('round-trips a staged file by token', () => {
		const token = stageImport('a,b\n1,2\n', 7);
		expect(readStagedImport(token)).toEqual({ csvText: 'a,b\n1,2\n', cycleId: 7 });
	});

	it('issues a different token each time', () => {
		expect(stageImport('x', 1)).not.toBe(stageImport('x', 1));
	});

	it('returns null for an unknown token', () => {
		expect(readStagedImport('nonsense')).toBeNull();
	});

	it('returns null once the stage has expired', () => {
		const start = 1_000_000;
		const token = stageImport('x', 1, start);
		expect(readStagedImport(token, start + STAGING_TTL_MS + 1)).toBeNull();
	});

	it('still returns a stage inside its TTL', () => {
		const start = 1_000_000;
		const token = stageImport('x', 1, start);
		expect(readStagedImport(token, start + STAGING_TTL_MS - 1)).not.toBeNull();
	});

	it('discards a stage', () => {
		const token = stageImport('x', 1);
		discardStagedImport(token);
		expect(readStagedImport(token)).toBeNull();
	});

	it('sweeps expired stages so they cannot accumulate', () => {
		const start = 1_000_000;
		const stale = stageImport('old', 1, start);
		stageImport('new', 1, start + STAGING_TTL_MS + 1);
		expect(readStagedImport(stale, start + STAGING_TTL_MS + 1)).toBeNull();
	});

	it('keeps separate stages independent', () => {
		const first = stageImport('one', 1);
		const second = stageImport('two', 2);
		expect(readStagedImport(first)!.csvText).toBe('one');
		expect(readStagedImport(second)!.cycleId).toBe(2);
	});
});
