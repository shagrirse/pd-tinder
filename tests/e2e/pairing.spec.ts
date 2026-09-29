import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { expect, test, type Page } from '@playwright/test';
import { E2E_DB, MEMBER_TOKENS_FILE } from './global-setup';

const ADMIN = { email: 'admin@example.com', password: 'admin-password-1' };

type TokenRow = { id: number; fullName: string; email: string; token: string };

function tokenFor(fullName: string): string {
	const rows = JSON.parse(readFileSync(MEMBER_TOKENS_FILE, 'utf8')) as TokenRow[];
	const row = rows.find((r) => r.fullName === fullName);
	if (!row) throw new Error(`No seeded member token for ${fullName}`);
	return row.token;
}

async function signIn(page: Page) {
	await page.goto('/login');
	await page.getByLabel('Email').fill(ADMIN.email);
	await page.getByLabel('Password').fill(ADMIN.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
}

async function downloadCsv(page: Page, linkName: string) {
	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('link', { name: linkName }).click();
	const download = await downloadPromise;
	const path = await download.path();
	return { filename: download.suggestedFilename(), csv: path ? readFileSync(path, 'utf8') : '' };
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

		// No baseline yet, so overriding is locked.
		const overridePanel = page.locator('.panel', { hasText: 'Override a pair' });
		await expect(overridePanel.getByText(/Close the preference form first/)).toBeVisible();
		await expect(page.getByRole('button', { name: 'Save override' })).toBeDisabled();

		await page.getByRole('button', { name: 'Run reconciliation' }).click();

		const row = page.locator('tr', { hasText: 'Priya Mentor' });
		await expect(row.getByText('Jordan Mentee')).toBeVisible();
		await expect(row.getByText('Mutual · first choice')).toBeVisible();

		const residualPanel = page.locator('.panel', { hasText: 'Residual' });
		await expect(residualPanel.getByText('Sam Mentor (mentor)')).toBeVisible();
		await expect(residualPanel.getByText('Alex Mentor (mentor)')).toBeVisible();
	});

	test('closing the form saves a baseline and unlocks overrides', async ({ page }) => {
		await signIn(page);
		await page.goto('/admin/pairing');

		await page.getByRole('button', { name: 'Close form' }).click();
		const dialog = page.getByRole('dialog', { name: 'Close the preference form?' });
		await expect(dialog.getByText(/saves the baseline/)).toBeVisible();
		await dialog.getByRole('button', { name: 'Close form' }).click();

		await expect(page.getByText('Closed', { exact: true })).toBeVisible();
		await expect(page.getByText(/^Baseline saved /)).toBeVisible();
		await expect(page.getByRole('button', { name: 'Run reconciliation' })).toBeHidden();
		await expect(page.getByRole('button', { name: 'Save override' })).toBeEnabled();

		// The UI hides the reconcile button, so the server guard is exercised
		// with a same-origin fetch (passes SvelteKit's CSRF origin check).
		const result = await page.evaluate(async () => {
			const res = await fetch('/admin/pairing?/reconcile', {
				method: 'POST',
				headers: { 'x-sveltekit-action': 'true' },
				body: new FormData()
			});
			return res.json();
		});
		expect(result).toMatchObject({ type: 'failure', status: 400 });
		// `data` is the devalue-serialised action payload, so the message is
		// readable as a substring.
		expect(result.data).toContain(
			'The form is closed, so the pairings already reflect the saved baseline.'
		);

		// Closing rebuilt the live pairs from the frozen choices, and the
		// rejected reconcile left them alone.
		const row = page.locator('tr', { hasText: 'Priya Mentor' });
		await expect(row.getByText('Jordan Mentee')).toBeVisible();
	});

	test('overrides a pair with a required reason', async ({ page }) => {
		await signIn(page);
		await page.goto('/admin/pairing');

		await page.getByLabel('Mentor').selectOption({ label: 'Sam Mentor' });
		await page.getByLabel('Mentee').selectOption({ label: 'Jordan Mentee — already paired' });
		await page.getByRole('button', { name: 'Save override' }).click();
		await expect(page.getByText('An override needs a reason.')).toBeVisible();

		await page.getByLabel('Mentor').selectOption({ label: 'Sam Mentor' });
		await page.getByLabel('Mentee').selectOption({ label: 'Jordan Mentee — already paired' });
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

	test('exports the pairings, the baseline and the override log', async ({ page }) => {
		await signIn(page);
		await page.goto('/admin/pairing');

		const pairingsFile = await downloadCsv(page, 'Export pairings CSV');
		expect(pairingsFile.filename).toMatch(/pairings\.csv$/);
		expect(pairingsFile.csv).toContain(
			'mentor_name,mentor_email,mentor_telegram,mentor_linkedin,mentor_student_id,mentee_name,mentee_email,mentee_telegram,mentee_linkedin,mentee_student_id,method,override_reason'
		);
		expect(pairingsFile.csv).toContain('Sam Mentor');
		expect(pairingsFile.csv).toContain('Jordan asked to switch at the mixer');

		const baselineFile = await downloadCsv(page, 'Export baseline CSV');
		expect(baselineFile.filename).toMatch(/baseline\.csv$/);
		expect(baselineFile.csv).toContain(
			'name,role,industry,student_id,email,choice_1,choice_1_reason,choice_2,choice_2_reason,choice_3,choice_3_reason,baseline_pair,baseline_method,their_rank_for_pair,pair_rank_for_them,baseline_created_at'
		);
		expect(baselineFile.csv).toContain('mutual_first');

		const overridesFile = await downloadCsv(page, 'Export overrides CSV');
		expect(overridesFile.filename).toMatch(/overrides\.csv$/);
		expect(overridesFile.csv).toContain(
			'created_at,created_by,mentor_name,mentor_student_id,mentee_name,mentee_student_id,reason,mentor_baseline_pair,mentee_baseline_pair,displaced_mentee,displaced_mentor,still_live'
		);
		expect(overridesFile.csv).toContain('Jordan asked to switch at the mixer');
	});

	test('reopening keeps the distributed link working', async ({ page }) => {
		const jordanToken = tokenFor('Jordan Mentee');
		const closedResponse = await page.goto(`/member/${jordanToken}`);
		expect(closedResponse?.status()).toBe(404);

		await signIn(page);
		await page.goto('/admin/pairing');
		await page.getByRole('button', { name: 'Reopen form' }).click();
		await expect(page.getByText('Open', { exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Run reconciliation' })).toBeVisible();

		await page.goto(`/member/${jordanToken}`);
		await expect(page.getByRole('heading', { name: 'Rank your top three mentors' })).toBeVisible();
	});

	test('opens the member modal from the form status list and the pairing table', async ({
		page
	}) => {
		seedMutualFirstChoice();
		await signIn(page);
		await page.goto('/admin/pairing');

		const statusPanel = page.locator('.panel', { hasText: 'Form status' });
		await statusPanel.getByRole('button', { name: 'Sam Mentor' }).click();
		const modal = page.getByRole('dialog');
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

	test('cancelling or escaping the close-form dialog leaves the form open', async ({ page }) => {
		await signIn(page);
		await page.goto('/admin/pairing');

		await page.getByRole('button', { name: 'Close form' }).click();
		const dialog = page.getByRole('dialog', { name: 'Close the preference form?' });
		await expect(dialog).toBeVisible();

		await dialog.getByRole('button', { name: 'Cancel' }).click();
		await expect(dialog).toBeHidden();
		await expect(page.getByText('Open', { exact: true })).toBeVisible();

		await page.getByRole('button', { name: 'Close form' }).click();
		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog')).toBeHidden();
		await expect(page.getByText('Open', { exact: true })).toBeVisible();
	});

	test('flags an already-paired member in the override selects without blocking the pick', async ({
		page
	}) => {
		seedMutualFirstChoice();
		await signIn(page);
		await page.goto('/admin/pairing');
		await page.getByRole('button', { name: 'Run reconciliation' }).click();

		const mentorSelect = page.getByLabel('Mentor');
		const menteeSelect = page.getByLabel('Mentee');
		await expect(mentorSelect.locator('option', { hasText: 'Priya Mentor' })).toHaveText(
			'Priya Mentor — already paired'
		);
		await expect(menteeSelect.locator('option', { hasText: 'Jordan Mentee' })).toHaveText(
			'Jordan Mentee — already paired'
		);

		await mentorSelect.selectOption({ label: 'Priya Mentor — already paired' });
		await menteeSelect.selectOption({ label: 'Jordan Mentee — already paired' });
		await page.getByLabel('Reason').fill('Admin decided to keep them, logged explicitly');
		await page.getByRole('button', { name: 'Save override' }).click();

		const row = page.locator('tr', { hasText: 'Priya Mentor' });
		await expect(row.getByText('Manual')).toBeVisible();
	});

	test('shows an accurate reconciliation caption', async ({ page }) => {
		await signIn(page);
		await page.goto('/admin/pairing');

		await expect(
			page.getByText(
				'Rebuilds pairings from current submissions. Manual overrides are preserved; every other pairing is recomputed.'
			)
		).toBeVisible();
	});
});
