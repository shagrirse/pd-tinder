import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { expect, test } from '@playwright/test';
import { E2E_DB, MEMBER_TOKENS_FILE } from './global-setup';

const ADMIN = { email: 'admin@example.com', password: 'admin-password-1' };

type TokenRow = { id: number; fullName: string; email: string; token: string };

function tokenFor(fullName: string): string {
	const rows = JSON.parse(readFileSync(MEMBER_TOKENS_FILE, 'utf8')) as TokenRow[];
	const row = rows.find((r) => r.fullName === fullName);
	if (!row) throw new Error(`No seeded member token for ${fullName}`);
	return row.token;
}

async function signIn(page: import('@playwright/test').Page) {
	await page.goto('/login');
	await page.getByLabel('Email').fill(ADMIN.email);
	await page.getByLabel('Password').fill(ADMIN.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
}

/**
 * Priya Mentor and Jordan Mentee name each other first choice; Sam and Alex
 * (the other two seeded mentors) submit nothing, so reconciliation pairs
 * exactly one pair and leaves the other two mentors in the residual. Cleared
 * and re-seeded here, not left to global-setup, so this file does not depend
 * on preferences.spec.ts having run first — or not having run.
 */
function seedMutualFirstChoice() {
	const db = new Database(E2E_DB);
	db.exec('delete from preferences; delete from pairings;');
	const roster = db.prepare('select id, full_name from members').all() as {
		id: number;
		full_name: string;
	}[];
	const idOf = (name: string) => roster.find((m) => m.full_name === name)!.id;

	const insert = db.prepare(
		'insert into preferences (member_id, choice_member_id, rank, reason) values (?, ?, 1, ?)'
	);
	insert.run(idOf('Priya Mentor'), idOf('Jordan Mentee'), 'met at the mixer');
	insert.run(idOf('Jordan Mentee'), idOf('Priya Mentor'), 'met at the mixer');
	db.close();
}

test.describe('pairing admin surface', () => {
	test('shows submission status and runs reconciliation into pairs and residual', async ({
		page
	}) => {
		seedMutualFirstChoice();
		await signIn(page);
		await page.goto('/admin/pairing');

		await expect(page.getByText('Open', { exact: true })).toBeVisible();
		await expect(page.getByText('2 of 4 submitted')).toBeVisible();

		const statusPanel = page.locator('.panel', { hasText: 'Form status' });
		await expect(statusPanel.getByText('Sam Mentor (mentor)')).toBeVisible();
		await expect(statusPanel.getByText('Alex Mentor (mentor)')).toBeVisible();

		await page.getByRole('button', { name: 'Run reconciliation' }).click();

		const row = page.locator('tr', { hasText: 'Priya Mentor' });
		await expect(row.getByText('Jordan Mentee')).toBeVisible();
		await expect(row.getByText('Mutual · first choice')).toBeVisible();

		const residualPanel = page.locator('.panel', { hasText: 'Residual' });
		await expect(residualPanel.getByText('Sam Mentor (mentor)')).toBeVisible();
		await expect(residualPanel.getByText('Alex Mentor (mentor)')).toBeVisible();
	});

	test('overrides a pair with a required reason', async ({ page }) => {
		await signIn(page);
		await page.goto('/admin/pairing');

		await page.getByLabel('Mentor').selectOption({ label: 'Sam Mentor' });
		await page.getByLabel('Mentee').selectOption({ label: 'Jordan Mentee' });
		await page.getByRole('button', { name: 'Save override' }).click();
		await expect(page.getByText('An override needs a reason.')).toBeVisible();

		await page.getByLabel('Mentor').selectOption({ label: 'Sam Mentor' });
		await page.getByLabel('Mentee').selectOption({ label: 'Jordan Mentee' });
		await page.getByLabel('Reason').fill('Jordan asked to switch at the mixer');
		await page.getByRole('button', { name: 'Save override' }).click();

		const row = page.locator('tr', { hasText: 'Sam Mentor' });
		await expect(row.getByText('Jordan Mentee')).toBeVisible();
		await expect(row.getByText('Manual')).toBeVisible();
		await expect(row.getByText('Jordan asked to switch at the mixer')).toBeVisible();

		// Priya lost her pair to the override and returns to the residual
		// immediately — computeResidual reads persisted pairings, not a re-run.
		const residualPanel = page.locator('.panel', { hasText: 'Residual' });
		await expect(residualPanel.getByText('Priya Mentor (mentor)')).toBeVisible();
	});

	test('closes and reopens the form without invalidating the distributed link', async ({
		page
	}) => {
		await signIn(page);
		await page.goto('/admin/pairing');

		await page.getByRole('button', { name: 'Close form' }).click();
		await expect(page.getByText('Closed', { exact: true })).toBeVisible();

		const jordanToken = tokenFor('Jordan Mentee');
		const closedResponse = await page.goto(`/member/${jordanToken}`);
		expect(closedResponse?.status()).toBe(404);

		await page.goto('/admin/pairing');
		await page.getByRole('button', { name: 'Reopen form' }).click();
		await expect(page.getByText('Open', { exact: true })).toBeVisible();

		await page.goto(`/member/${jordanToken}`);
		await expect(page.getByRole('heading', { name: 'Rank your top three mentors' })).toBeVisible();
	});

	test('exports the pairing record as CSV', async ({ page }) => {
		await signIn(page);
		await page.goto('/admin/pairing');

		const downloadPromise = page.waitForEvent('download');
		await page.getByRole('link', { name: 'Export CSV' }).click();
		const download = await downloadPromise;

		expect(download.suggestedFilename()).toMatch(/pairings\.csv$/);
		const path = await download.path();
		const csv = path ? readFileSync(path, 'utf8') : '';
		expect(csv).toContain(
			'mentor_name,mentor_email,mentor_student_id,mentee_name,mentee_email,mentee_student_id,method,override_reason'
		);
		expect(csv).toContain('Sam Mentor');
		expect(csv).toContain('Jordan asked to switch at the mixer');
	});

	test('opens the member modal from the form status list and the pairing table', async ({
		page
	}) => {
		seedMutualFirstChoice();
		await signIn(page);
		await page.goto('/admin/pairing');

		const statusPanel = page.locator('.panel', { hasText: 'Form status' });
		await statusPanel.getByRole('button', { name: 'Sam Mentor' }).click();
		const modal = page.getByRole('dialog', { name: 'Member detail' });
		await expect(modal).toBeVisible();
		await expect(modal.getByRole('heading', { name: 'Sam Mentor' })).toBeVisible();
		await expect(modal.getByText('Mentor', { exact: true })).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(modal).toBeHidden();

		await page.getByRole('button', { name: 'Run reconciliation' }).click();
		const recon = page.locator('.panel', { hasText: 'Reconciliation' });
		await recon.getByRole('button', { name: 'Priya Mentor' }).click();
		await expect(modal).toBeVisible();
		await expect(modal.getByRole('heading', { name: 'Priya Mentor' })).toBeVisible();
	});
});
