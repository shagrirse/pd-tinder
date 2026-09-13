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

	test('a mentee file that resolves nothing is blocked, not committed', async ({ page }) => {
		await signIn(page);
		await page.goto('/admin/roster');

		await page.getByLabel('Mentee roster CSV file').setInputFiles({
			name: 'roster-unknown.csv',
			mimeType: 'text/csv',
			buffer: Buffer.from('student_id,industry\n99999999,Finance\n')
		});
		await page.getByRole('button', { name: 'Validate mentees' }).click();

		await expect(page.getByText('99999999')).toBeVisible();
		await expect(page.getByRole('button', { name: /Import \d+ mentees/ })).toHaveCount(0);
	});
});
