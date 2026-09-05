import { defineConfig } from '@playwright/test';

// Live smoke test (spec §9). Starts no server of its own: the target is either
// the deployed instance (SMOKE_BASE_URL=https://pdtinder.kattokloset.com) or a
// locally rehearsed compose stack (SMOKE_BASE_URL=https://localhost:18443).
// TLS errors are tolerated only for the localhost rehearsal — on the live URL
// Playwright's normal certificate validation is the TLS check itself.
const baseURL = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
	// testDir resolves relative to this config file's directory, so '.' —
	// 'scripts/smoke' here would point at a nonexistent nested path.
	testDir: '.',
	workers: 1,
	timeout: 60_000,
	reporter: 'list',
	use: {
		baseURL,
		ignoreHTTPSErrors: baseURL.includes('localhost')
	}
});
