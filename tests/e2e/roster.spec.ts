import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const ADMIN = { email: 'admin@example.com', password: 'admin-password-1' };

const MENTEES = 'tests/fixtures/roster-mentees.csv';
const MENTORS = 'tests/fixtures/roster-mentors.csv';

async function signIn(page: import('@playwright/test').Page) {
	await page.goto('/login');
	await page.getByLabel('Email').fill(ADMIN.email);
	await page.getByLabel('Password').fill(ADMIN.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
}

test.describe('roster import', () => {
	test('imports selected mentees and shows them in the roster', async ({ page }) => {
		await signIn(page);
		await page.goto('/admin/roster');

		await page.getByLabel('Mentee roster CSV file').setInputFiles(MENTEES);
		await page.getByRole('button', { name: 'Validate mentees' }).click();

		// The mismatch for 01000002 is reported as information, and the import is offered.
		await expect(page.getByText(/1 of the mentees/)).toBeVisible();
		await expect(page.getByRole('button', { name: /Import 2 mentees/ })).toBeVisible();

		await page.getByRole('button', { name: /Import 2 mentees/ }).click();
		await expect(page.getByText(/2 mentees added/)).toBeVisible();

		await expect(page.getByText('Ada Fictional')).toBeVisible();
		await expect(page.getByText('Bo Fictional')).toBeVisible();
	});

	test('imports mentors and counts by role', async ({ page }) => {
		await signIn(page);
		await page.goto('/admin/roster');

		await page.getByLabel('Mentor roster CSV file').setInputFiles(MENTORS);
		await page.getByRole('button', { name: 'Validate mentors' }).click();
		await page.getByRole('button', { name: /Import 2 mentors/ }).click();
		await expect(page.getByText(/2 mentors added/)).toBeVisible();

		await expect(page.getByText('Mentor Alpha')).toBeVisible();
		await expect(page.getByText('Mentor Beta')).toBeVisible();
	});

	test('a mentee file with no matching applicant creates a new mentee', async ({ page }) => {
		await signIn(page);
		await page.goto('/admin/roster');

		await page.getByLabel('Mentee roster CSV file').setInputFiles({
			name: 'roster-new-mentee.csv',
			mimeType: 'text/csv',
			buffer: Buffer.from(
				'student_id,industry,full_name,email\n99999999,Finance,New Mentee,new-mentee@example.com\n'
			)
		});
		await page.getByRole('button', { name: 'Validate mentees' }).click();

		await expect(
			page.getByText('1 mentee will be created — no prior application found')
		).toBeVisible();
		await expect(page.getByRole('button', { name: /Import 1 mentee/ })).toBeVisible();

		await page.getByRole('button', { name: /Import 1 mentee/ }).click();
		await expect(page.getByText(/1 mentee added/)).toBeVisible();
		// Scoped to the roster entry: "New Mentee" alone also matches the csv-note
		// ("...create a new mentee from the CSV") and trips strict mode.
		await expect(page.getByText('New Mentee — new-mentee@example.com')).toBeVisible();
	});

	test('a mentee file missing the email column is blocked', async ({ page }) => {
		await signIn(page);
		await page.goto('/admin/roster');

		await page.getByLabel('Mentee roster CSV file').setInputFiles({
			name: 'roster-no-email.csv',
			mimeType: 'text/csv',
			buffer: Buffer.from('student_id,industry,full_name\n01000001,Finance,Ada Fictional\n')
		});
		await page.getByRole('button', { name: 'Validate mentees' }).click();

		await expect(
			page.getByText('No column is mapped to the required field "email".')
		).toBeVisible();
		await expect(page.getByRole('button', { name: /Import \d+ mentees/ })).toHaveCount(0);
	});

	test('shows an error when the commit token is invalid', async ({ page }) => {
		await signIn(page);
		await page.goto('/admin/roster');

		await page.getByLabel('Mentee roster CSV file').setInputFiles(MENTEES);
		await page.getByRole('button', { name: 'Validate mentees' }).click();
		await expect(page.getByRole('button', { name: /Import 2 mentees/ })).toBeVisible();

		// Playwright refuses to fill a type="hidden" input, so set the value directly.
		await page
			.locator('form[action="?/commitMentees"] input[name="token"]')
			.evaluate((el) => ((el as HTMLInputElement).value = 'bogus'));
		await page.getByRole('button', { name: /Import 2 mentees/ }).click();

		await expect(
			page.getByText('That upload expired or was already used. Upload the file again.')
		).toBeVisible();
	});

	test('generates and downloads member links for the current roster', async ({ page }) => {
		await signIn(page);
		await page.goto('/admin/roster');

		// Runs after the earlier tests in this file, which already committed
		// mentors and mentees into the shared e2e database — nothing to import here.
		await expect(page.getByText('Ada Fictional')).toBeVisible();

		const downloadPromise = page.waitForEvent('download');
		await page.getByRole('button', { name: 'Generate & export member links' }).click();
		const download = await downloadPromise;

		expect(download.suggestedFilename()).toMatch(/member-links\.csv$/);
		const path = await download.path();
		const csv = path ? readFileSync(path, 'utf8') : '';
		expect(csv).toContain('role,full_name,email,link');
		expect(csv).toContain('/member/');
	});

	test('mentee imports work against a closed cycle; mentor imports still do not', async ({
		page
	}) => {
		await signIn(page);
		await page.goto('/admin/roster');

		// Mentee panel: the closed cycle accepts matched and new-mentee rows.
		const menteeForm = page.locator('form[action="?/validateMentees"]');
		await menteeForm.locator('select[name="cycleId"]').selectOption('2');
		await menteeForm.getByLabel('Mentee roster CSV file').setInputFiles({
			name: 'roster-closed-cycle.csv',
			mimeType: 'text/csv',
			buffer: Buffer.from(
				'student_id,industry,full_name,email\n01000003,Finance,Cy Closed,cy-closed@example.com\n99999999,Tech,New Closed Mentee,new-closed@example.com\n'
			)
		});
		await menteeForm.getByRole('button', { name: 'Validate mentees' }).click();

		await expect(
			page.getByText('1 mentee will be created — no prior application found')
		).toBeVisible();
		await page.getByRole('button', { name: /Import 2 mentees/ }).click();
		await expect(page.getByText(/2 mentees added/)).toBeVisible();

		// Mentor panel: the same closed cycle still rejects the import.
		const mentorForm = page.locator('form[action="?/validateMentors"]');
		await mentorForm.locator('select[name="cycleId"]').selectOption('2');
		await mentorForm.getByLabel('Mentor roster CSV file').setInputFiles(MENTORS);
		await mentorForm.getByRole('button', { name: 'Validate mentors' }).click();

		await expect(page.getByText('That cycle is closed. Reopen it before importing.')).toBeVisible();
	});
});
