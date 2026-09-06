import { expect, test } from '@playwright/test';

const ADMIN = {
	email: process.env.SMOKE_ADMIN_EMAIL ?? 'admin@example.com',
	password: process.env.SMOKE_ADMIN_PASSWORD ?? ''
};
if (ADMIN.password === '') {
	throw new Error('SMOKE_ADMIN_PASSWORD is required — pass the bootstrapped admin password.');
}

const CSV = process.env.SMOKE_CSV ?? 'tmc.csv';
const REVIEWER = {
	name: 'Smoke Reviewer',
	email: `smoke-reviewer-${Date.now()}@example.com`,
	password: 'smoke-reviewer-password-1'
};

test('live flow steps 1–5: serve, sign in, import, invite a reviewer, submit a verdict', async ({
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
	await reviewer.close();
});
