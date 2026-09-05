import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Variables the production server needs. Two of these — ORIGIN and
 * BODY_SIZE_LIMIT — are enforced only by adapter-node and ignored by the dev
 * server, so nothing else in this suite can catch them being wrong. Keeping them
 * documented is the only local guard that exists.
 */
const REQUIRED = ['DATABASE_URL', 'ORIGIN', 'BODY_SIZE_LIMIT', 'PORT'];

const template = readFileSync('.env.example', 'utf8');

describe('.env.example', () => {
	it.each(REQUIRED)('documents %s', (key) => {
		expect(template).toMatch(new RegExp(`^${key}=`, 'm'));
	});

	it('gives ORIGIN a full https URL rather than a bare host', () => {
		// A bare host silently fails adapter-node's origin parsing.
		expect(template).toMatch(/^ORIGIN=https:\/\/\S+$/m);
	});
});
