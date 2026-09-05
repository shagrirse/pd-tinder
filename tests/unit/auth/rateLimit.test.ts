import { beforeEach, describe, expect, it } from 'vitest';
import {
	MAX_ATTEMPTS,
	WINDOW_MS,
	clearAttempts,
	isAllowed,
	recordFailure,
	resetRateLimiter
} from '../../../src/lib/server/auth/rateLimit';

beforeEach(() => resetRateLimiter());

describe('rate limiting', () => {
	it('allows attempts below the limit', () => {
		for (let i = 0; i < MAX_ATTEMPTS - 1; i++) recordFailure('user@example.com');
		expect(isAllowed('user@example.com')).toBe(true);
	});

	it('blocks once the limit is reached', () => {
		for (let i = 0; i < MAX_ATTEMPTS; i++) recordFailure('user@example.com');
		expect(isAllowed('user@example.com')).toBe(false);
	});

	it('tracks keys independently', () => {
		for (let i = 0; i < MAX_ATTEMPTS; i++) recordFailure('blocked@example.com');
		expect(isAllowed('other@example.com')).toBe(true);
	});

	it('allows again once the window has passed', () => {
		const start = 1_000_000;
		for (let i = 0; i < MAX_ATTEMPTS; i++) recordFailure('user@example.com', start);
		expect(isAllowed('user@example.com', start + WINDOW_MS + 1)).toBe(true);
	});

	it('clears attempts on a successful login', () => {
		for (let i = 0; i < MAX_ATTEMPTS; i++) recordFailure('user@example.com');
		clearAttempts('user@example.com');
		expect(isAllowed('user@example.com')).toBe(true);
	});
});
