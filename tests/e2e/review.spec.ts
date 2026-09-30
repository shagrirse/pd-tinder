import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import { E2E_DB } from './global-setup';

// Each journey needs the full two-applicant pool, so wipe review state between tests.
// WAL mode makes this safe while the app server holds the database open.
test.beforeEach(() => {
	const db = new Database(E2E_DB);
	db.exec('delete from verdicts; delete from ratings; delete from claims;');
	db.close();
});

const REVIEWER = { email: 'reviewer@example.com', password: 'reviewer-password-1' };
const ADMIN = { email: 'admin@example.com', password: 'admin-password-1' };

async function signIn(
	page: import('@playwright/test').Page,
	who: { email: string; password: string }
) {
	await page.goto('/login');
	await page.getByLabel('Email').fill(who.email);
	await page.getByLabel('Password').fill(who.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
}

test.describe('reviewer journey', () => {
	test('reviews an applicant and moves to the next', async ({ page }) => {
		await signIn(page, REVIEWER);

		await expect(page.getByRole('heading', { name: 'Applicant #1' })).toBeVisible();
		await page.getByRole('group').first().getByRole('button', { name: 'Good' }).click();
		await page.getByRole('button', { name: 'Meh', exact: true }).last().click();

		await expect(page.getByRole('heading', { name: 'Applicant #2' })).toBeVisible();
	});

	test('never shows applicant identity on the card', async ({ page }) => {
		await signIn(page, REVIEWER);

		const body = await page.locator('body').innerText();
		expect(body).not.toContain('Ada Fictional');
		expect(body).not.toContain('ada@example.com');
		expect(body).not.toContain('01000001');
		expect(body).not.toContain('@adafictional');
	});

	test('flags a missing LinkedIn profile', async ({ page }) => {
		await signIn(page, REVIEWER);
		await page.getByRole('button', { name: 'Meh', exact: true }).last().click();

		await expect(page.getByRole('heading', { name: 'Applicant #2' })).toBeVisible();
		await expect(page.getByText('No LinkedIn profile provided')).toBeVisible();
	});

	test('requires a reason before a red flag can be confirmed', async ({ page }) => {
		await signIn(page, REVIEWER);
		await page.getByRole('button', { name: 'Red flag' }).click();

		const confirm = page.getByRole('button', { name: 'Confirm red flag' });
		await expect(confirm).toBeDisabled();

		await page
			.getByPlaceholder('What is disqualifying?')
			.fill('Disclosed intent to misuse the network.');
		await expect(confirm).toBeEnabled();
		await confirm.click();
		await page.getByRole('button', { name: 'Submit red flag' }).click();

		await expect(page.getByRole('heading', { name: 'Applicant #2' })).toBeVisible();
	});

	test('shows a Title Case verdict on the reviewed list', async ({ page }) => {
		await signIn(page, REVIEWER);
		await page.getByRole('group').first().getByRole('button', { name: 'Good' }).click();
		await page.getByRole('button', { name: 'Meh', exact: true }).last().click();
		await expect(page.getByRole('heading', { name: 'Applicant #2' })).toBeVisible();

		await page.goto('/review/reviewed');
		await expect(page.locator('li').first().getByText('Meh', { exact: true })).toBeVisible();
	});

	test('shows the keyboard shortcut hint', async ({ page }) => {
		await signIn(page, REVIEWER);
		await expect(page.getByText('1 · 2 · 3 to rate')).toBeVisible();
	});

	test('revisits a verdict from the reviewed list and changes it', async ({ page }) => {
		await signIn(page, REVIEWER);
		await expect(page.getByRole('heading', { name: 'Applicant #1' })).toBeVisible();
		await page.getByRole('group').first().getByRole('button', { name: 'Good' }).click();
		await page.getByLabel('Note for the admin').fill('First impressions only.');
		await page.getByRole('button', { name: 'Meh', exact: true }).last().click();
		await expect(page.getByRole('heading', { name: 'Applicant #2' })).toBeVisible();

		await page.goto('/review/reviewed');
		await page.getByRole('link', { name: /^#1 / }).click();

		// The deck reopens on the reviewed applicant with the saved answers.
		await expect(page.getByRole('heading', { name: 'Applicant #1' })).toBeVisible();
		await expect(
			page.getByRole('group').first().getByRole('button', { name: 'Good' })
		).toHaveAttribute('aria-pressed', 'true');
		await expect(page.getByLabel('Note for the admin')).toHaveValue('First impressions only.');

		const saved = page.waitForResponse(
			(res) => res.request().method() === 'POST' && new URL(res.url()).pathname === '/review'
		);
		await page.getByRole('button', { name: 'Weak', exact: true }).last().click();
		expect((await saved).ok()).toBe(true);

		await page.goto('/review/reviewed');
		const rows = page.locator('li');
		await expect(rows).toHaveCount(1);
		await expect(rows.first().getByText('Weak', { exact: true })).toBeVisible();
	});
});

test.describe('admin journey', () => {
	test('sees results and downloads the export', async ({ page }) => {
		await signIn(page, ADMIN);
		await page.goto('/results');

		await expect(page.getByRole('heading', { name: /Results/ })).toBeVisible();
		const downloadPromise = page.waitForEvent('download');
		await page.getByRole('link', { name: 'Download full CSV' }).click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toBe('pd-tinder-mentee-recruitment-2026.csv');
		const csv = readFileSync((await download.path())!, 'utf8');
		expect(csv.split('\n')[0]).toMatch(
			/^public_ref,full_name,email,smu_email,student_id,contact_number,telegram,linkedin_url,linkedin_status,industry_1,industry_2,faculty,faculty_2,gender,prior_mentee,submitted_at,reviewer,overall,red_flag,red_flag_reason,note,score,rated,total,rating_/
		);
	});

	test('blocks a reviewer from the results page', async ({ page }) => {
		await signIn(page, REVIEWER);
		const response = await page.goto('/results');
		expect(response?.status()).toBe(403);
	});
});
