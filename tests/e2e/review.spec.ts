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

async function signIn(page: import('@playwright/test').Page, who: { email: string; password: string }) {
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

		await page.getByPlaceholder('What is disqualifying?').fill('Disclosed intent to misuse the network.');
		await expect(confirm).toBeEnabled();
		await confirm.click();
		await page.getByRole('button', { name: 'Submit red flag' }).click();

		await expect(page.getByRole('heading', { name: 'Applicant #2' })).toBeVisible();
	});
});

test.describe('admin journey', () => {
	test('sees results and can reach the export', async ({ page }) => {
		await signIn(page, ADMIN);
		await page.goto('/results');

		await expect(page.getByRole('heading', { name: /Results/ })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Download full CSV' })).toBeVisible();
	});

	test('blocks a reviewer from the results page', async ({ page }) => {
		await signIn(page, REVIEWER);
		const response = await page.goto('/results');
		expect(response?.status()).toBe(403);
	});
});
