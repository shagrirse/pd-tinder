import { expect, test, type Page } from '@playwright/test';

const ADMIN = { email: 'admin@example.com', password: 'admin-password-1' };

async function signIn(page: Page) {
	await page.goto('/login');
	await page.getByLabel('Email').fill(ADMIN.email);
	await page.getByLabel('Password').fill(ADMIN.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
}

/** The table row whose Name cell holds `name`. Other cells can name the same person. */
const rowOf = (page: Page, name: string) =>
	page.locator('tbody tr').filter({ has: page.locator('td.col-name', { hasText: name }) });

const firstName = (page: Page) => page.locator('tbody tr').first().locator('td.col-name');

test.describe('members table', () => {
	test('lists every active member with a count', async ({ page }) => {
		await signIn(page);
		await page.goto('/admin/members');

		await expect(page.getByText('Showing 4 of 4')).toBeVisible();
		for (const name of ['Priya Mentor', 'Sam Mentor', 'Alex Mentor', 'Jordan Mentee']) {
			await expect(rowOf(page, name)).toBeVisible();
		}
	});

	test('searches by name and email, and explains an empty result', async ({ page }) => {
		await signIn(page);
		await page.goto('/admin/members');

		await page.getByLabel('Search').fill('JORDAN');
		await expect(page.getByText('Showing 1 of 4')).toBeVisible();
		await expect(rowOf(page, 'Jordan Mentee')).toBeVisible();

		await page.getByLabel('Search').fill('alex-mentor@');
		await expect(page.getByText('Showing 1 of 4')).toBeVisible();
		await expect(rowOf(page, 'Alex Mentor')).toBeVisible();

		await page.getByLabel('Search').fill('nobody at all');
		await expect(page.getByText('Showing 0 of 4')).toBeVisible();
		await expect(page.getByText('No members match these filters.')).toBeVisible();

		await page.getByRole('button', { name: 'Reset filters' }).click();
		await expect(page.getByText('Showing 4 of 4')).toBeVisible();
		await expect(page.getByLabel('Search')).toHaveValue('');
	});

	test('filters by role, industry and pairing state', async ({ page }) => {
		await signIn(page);
		await page.goto('/admin/members');

		await page.getByLabel('Role').selectOption('mentee');
		await expect(page.getByText('Showing 1 of 4')).toBeVisible();
		await expect(rowOf(page, 'Jordan Mentee')).toBeVisible();

		await page.getByRole('button', { name: 'Reset filters' }).click();
		await page.getByLabel('Industry').selectOption('Tech');
		await expect(page.getByText('Showing 1 of 4')).toBeVisible();
		await expect(rowOf(page, 'Alex Mentor')).toBeVisible();

		await page.getByRole('button', { name: 'Reset filters' }).click();
		await expect(page.getByLabel('Pairing').locator('option[value="not_submitted"]')).toHaveText(
			'Not submitted (4)'
		);
		await page.getByLabel('Pairing').selectOption('paired');
		await expect(page.getByText('Showing 0 of 4')).toBeVisible();
	});

	test('sorts by a column header and flips on a second click', async ({ page }) => {
		await signIn(page);
		await page.goto('/admin/members');

		const nameHeader = page.getByRole('columnheader', { name: 'Name' });
		await nameHeader.getByRole('button').click();
		await expect(nameHeader).toHaveAttribute('aria-sort', /^(ascending|descending)$/);
		const first = await nameHeader.getAttribute('aria-sort');
		await expect(firstName(page)).toHaveText(first === 'ascending' ? 'Alex Mentor' : 'Sam Mentor');

		await nameHeader.getByRole('button').click();
		const second = first === 'ascending' ? 'descending' : 'ascending';
		await expect(nameHeader).toHaveAttribute('aria-sort', second);
		await expect(firstName(page)).toHaveText(second === 'ascending' ? 'Alex Mentor' : 'Sam Mentor');
	});

	test('opens the member modal from a name', async ({ page }) => {
		await signIn(page);
		await page.goto('/admin/members');

		await rowOf(page, 'Priya Mentor').getByRole('button', { name: 'Priya Mentor' }).click();
		const modal = page.getByRole('dialog');
		await expect(modal.getByRole('heading', { name: 'Priya Mentor' })).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(modal).toBeHidden();
	});
});
