import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
	testDir: 'tests/e2e',
	globalSetup: './tests/e2e/global-setup.ts',
	// admin.spec.ts and review.spec.ts share one SQLite DB and a finite two-applicant
	// claim pool. Playwright's default worker count is 50% of the CPU cores (not 1),
	// and with two spec files that means both files run concurrently by default,
	// racing to claim/verdict the same two rows. Force one worker so the suite is
	// deterministic regardless of host CPU count.
	workers: 1,
	use: {
		baseURL: `http://localhost:${PORT}`,
		...devices['Pixel 7']
	},
	webServer: {
		command: 'npm run build && node build',
		url: `http://localhost:${PORT}`,
		reuseExistingServer: false,
		env: {
			DATABASE_URL: '.e2e/pd-tinder.db',
			PORT: String(PORT),
			NODE_ENV: 'production',
			// adapter-node checks form POSTs against this origin; without it
			// every login submission dies with "Cross-site POST form submissions are forbidden".
			ORIGIN: `http://localhost:${PORT}`,
			// The import wizard uploads a CSV larger than adapter-node's 512K default.
			BODY_SIZE_LIMIT: '5M'
		}
	}
});
