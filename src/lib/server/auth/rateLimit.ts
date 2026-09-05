export const MAX_ATTEMPTS = 5;
export const WINDOW_MS = 15 * 60 * 1000;

type Window = { count: number; startedAt: number };

const windows = new Map<string, Window>();

export function isAllowed(key: string, now: number = Date.now()): boolean {
	const window = windows.get(key);
	if (!window) return true;
	if (now - window.startedAt > WINDOW_MS) return true;
	return window.count < MAX_ATTEMPTS;
}

export function recordFailure(key: string, now: number = Date.now()): void {
	const window = windows.get(key);
	if (!window || now - window.startedAt > WINDOW_MS) {
		windows.set(key, { count: 1, startedAt: now });
		return;
	}
	window.count += 1;
}

export function clearAttempts(key: string): void {
	windows.delete(key);
}

export function resetRateLimiter(): void {
	windows.clear();
}
