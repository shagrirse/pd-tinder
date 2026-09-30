import { expect, test, type Page } from '@playwright/test';

// What a run leaves behind on the target, since a live run acts on real data:
//
// - Step 3 imports SMOKE_CSV, unless SMOKE_SKIP_IMPORT=1 (the restore drill).
// - Step 4 creates a `smoke-reviewer-<timestamp>` account, and redeeming its
//   invite claims one applicant for two hours. Deactivate the account on
//   /admin/people after a live run: that also releases the claim.
// - Step 5 submits a real verdict on a real applicant, so it runs only with
//   SMOKE_WRITE_VERDICT=1. Leave it unset on a live site. The local rehearsal
//   sets it, because there the applicants are throwaway.
//
// Every other check is read-only: it never changes pairing or preference state.

const ADMIN = {
	email: process.env.SMOKE_ADMIN_EMAIL ?? 'admin@example.com',
	password: process.env.SMOKE_ADMIN_PASSWORD ?? ''
};
if (ADMIN.password === '') {
	throw new Error('SMOKE_ADMIN_PASSWORD is required — pass the bootstrapped admin password.');
}

const CSV = process.env.SMOKE_CSV ?? 'tmc.csv';
const WRITE_VERDICT = process.env.SMOKE_WRITE_VERDICT === '1';
const REVIEWER = {
	name: 'Smoke Reviewer',
	email: `smoke-reviewer-${Date.now()}@example.com`,
	password: 'smoke-reviewer-password-1'
};

async function signInAdmin(page: Page) {
	await page.goto('/login');
	await page.getByLabel('Email').fill(ADMIN.email);
	await page.getByLabel('Password').fill(ADMIN.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
}

test('live flow: serve, sign in, import, invite a reviewer, and (opt-in) submit a verdict', async ({
	page,
	context
}) => {
	// Step 1: the site serves. Playwright negotiates TLS before this runs, so a
	// bad certificate on the live URL throws before any assertion.
	await page.goto('/login');
	await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

	// Step 2: a form POST succeeds — the ORIGIN check. No other step
	// catches a rejected CSRF origin.
	await page.getByLabel('Email').fill(ADMIN.email);
	await page.getByLabel('Password').fill(ADMIN.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await page.goto('/admin/import');
	await expect(page.getByLabel('CSV file')).toBeVisible();

	if (process.env.SMOKE_SKIP_IMPORT === '1') {
		// Restore-drill re-run: the import already happened before the drill.
		// The restored database must still contain its data.
		await page.goto('/results');
		await expect(page.getByRole('heading', { name: /^Results/ })).toBeVisible();
		await expect(page.getByText('No recruitment cycle is open.')).toHaveCount(0);
	} else {
		// Step 3: importing the real CSV succeeds — the BODY_SIZE_LIMIT check
		// against the real adapter and file size, and proof that drizzle/ shipped
		// and migrations ran (the wizard reads the cycles table).
		await page.getByLabel('CSV file').setInputFiles(CSV);
		await page.getByRole('button', { name: 'Validate' }).click();
		await expect(page.getByText('Nothing has been written yet.')).toBeVisible();
		await page.getByRole('button', { name: /Import \d+ applicants/ }).click();
		await expect(page.getByText('Import complete')).toBeVisible();
	}

	// Step 4: an administrator invites a reviewer; the reviewer redeems the
	// invite and chooses their own password through the public flow.
	await page.goto('/admin/people');
	await page.getByLabel('Name').fill(REVIEWER.name);
	await page.getByLabel('Email').fill(REVIEWER.email);
	await page.getByLabel('Role').selectOption('reviewer');
	await page.getByRole('checkbox').first().check();
	await page.getByRole('button', { name: 'Create and issue invite' }).click();
	const inviteUrl = await page.locator('.invite-panel code').textContent();
	expect(inviteUrl).toMatch(/\/invite\/\S+/);

	const reviewer = await context.browser()!.newContext();
	const rpage = await reviewer.newPage();
	await rpage.goto(inviteUrl!);
	await rpage.getByLabel('Password').fill(REVIEWER.password);
	await rpage.getByRole('button', { name: 'Set password and sign in' }).click();
	await expect(rpage).toHaveURL(/\/review$/);

	if (WRITE_VERDICT) {
		// Step 5: the reviewer claims an applicant and submits a verdict. The
		// deck's cards are not necessarily numbered from #1: real applicants
		// span industries and earlier runs may have reviewed some — so match
		// any applicant heading, then assert the deck advanced to a different
		// one after the verdict.
		const card = rpage.getByRole('heading', { name: /^Applicant #\d+$/ });
		await expect(card.first()).toBeVisible();
		const first = await card.first().textContent();
		await rpage.getByRole('group').first().getByRole('button', { name: 'Good' }).click();
		await rpage.getByRole('button', { name: 'Meh', exact: true }).last().click();
		await expect(card.first()).not.toHaveText(first!);
	}

	// The admin guard holds in the production build, including on the pages
	// added since the first deploy.
	for (const path of ['/results', '/admin/members', '/admin/roster']) {
		const response = await rpage.goto(path);
		expect(response?.status(), path).toBe(403);
	}
	await reviewer.close();
});

const EXPORT_HEADERS: Record<string, string> = {
	'/admin/members/export/pairings':
		'mentor_name,mentor_email,mentor_telegram,mentor_linkedin,mentor_student_id,mentee_name,mentee_email,mentee_telegram,mentee_linkedin,mentee_student_id,method,override_reason',
	'/admin/members/export/baseline':
		'name,role,industry,student_id,email,choice_1,choice_1_reason,choice_2,choice_2_reason,choice_3,choice_3_reason,baseline_pair,baseline_method,their_rank_for_pair,pair_rank_for_them,baseline_created_at',
	'/admin/members/export/overrides':
		'created_at,created_by,mentor_name,mentor_student_id,mentee_name,mentee_student_id,reason,mentor_baseline_pair,mentee_baseline_pair,displaced_mentee,displaced_mentor,still_live'
};

test('pages added since the first deploy serve, read-only', async ({ page, request }) => {
	await signInAdmin(page);

	// Both pages read the members-domain tables, so they prove the migrations
	// added since the first deploy shipped and ran.
	await page.goto('/admin/roster');
	await expect(page.getByRole('heading', { name: 'Pairing roster' })).toBeVisible();

	await page.goto('/admin/members');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Members\s·\s\S/);
	await expect(page.getByText('Preference form', { exact: true })).toBeVisible();

	await page.goto('/admin/pairing');
	await expect(page).toHaveURL(/\/admin\/members$/);

	for (const [path, header] of Object.entries(EXPORT_HEADERS)) {
		const response = await page.request.get(path);
		const body = await response.text();
		if (path.endsWith('/baseline') && response.status() === 404) {
			// A cycle whose preference form has never closed has no baseline,
			// and closing the form to make one would change pairing state.
			expect(body).toContain('No baseline yet');
			continue;
		}
		expect(response.status(), path).toBe(200);
		expect(response.headers()['content-type'], path).toContain('text/csv');
		expect(body.split(/\r?\n/)[0], path).toBe(header);
	}

	// The public member route sits outside any session, so this request
	// carries no cookie: it must answer 404, not redirect or 500.
	const bogus = await request.get('/member/smoke-not-a-real-token');
	expect(bogus.status()).toBe(404);
	expect(await bogus.text()).toContain('This link is invalid or has expired.');
});
