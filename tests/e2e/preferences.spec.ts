import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { MEMBER_TOKENS_FILE } from './global-setup';

type TokenRow = { id: number; fullName: string; email: string; token: string };

function rows(): TokenRow[] {
	return JSON.parse(readFileSync(MEMBER_TOKENS_FILE, 'utf8'));
}

function tokenFor(fullName: string): string {
	const row = rows().find((r) => r.fullName === fullName);
	if (!row) throw new Error(`No seeded member token for ${fullName}`);
	return row.token;
}

function idFor(fullName: string): string {
	const row = rows().find((r) => r.fullName === fullName);
	if (!row) throw new Error(`No seeded member for ${fullName}`);
	return String(row.id);
}

test.describe('preference submission page', () => {
	test('shows an invalid link as not found', async ({ page }) => {
		const response = await page.goto('/member/not-a-real-token');
		expect(response?.status()).toBe(404);
		await expect(page.getByText('This link is invalid or has expired.')).toBeVisible();
	});

	test('a member ranks their choices, grouped by industry, and can revise them', async ({
		page
	}) => {
		await page.goto(`/member/${tokenFor('Jordan Mentee')}`);

		await expect(page.getByRole('heading', { name: 'Rank your top three mentors' })).toBeVisible();
		await expect(page.getByText('Jordan Mentee')).toBeVisible();

		const first = page.getByLabel('First choice', { exact: true });
		const second = page.getByLabel('Second choice', { exact: true });
		const third = page.getByLabel('Third choice', { exact: true });

		await expect(
			first.locator('optgroup[label="Finance"] option', { hasText: 'Priya Mentor' })
		).toHaveCount(1);
		await expect(
			first.locator('optgroup[label="Tech"] option', { hasText: 'Alex Mentor' })
		).toHaveCount(1);

		await first.selectOption({ value: idFor('Priya Mentor') });
		// Priya is now taken by the first choice: the second choice still offers
		// her (picking her there swaps the two), but flags where she currently sits.
		await expect(second.locator('option', { hasText: 'Priya Mentor' })).toHaveText(
			'Priya Mentor (currently your first choice)'
		);

		await second.selectOption({ value: idFor('Sam Mentor') });
		await third.selectOption({ value: idFor('Alex Mentor') });

		await page.getByLabel('First choice reason').fill('Worked together at the mixer');
		await page.getByLabel('Second choice reason').fill('Same industry focus');
		await page.getByLabel('Third choice reason').fill('Recommended by a friend');

		await page.getByRole('button', { name: 'Save my choices' }).click();
		await expect(page.getByText('Saved.')).toBeVisible();

		await page.reload();
		await expect(first.locator('option:checked')).toHaveText('Priya Mentor');
		await expect(second.locator('option:checked')).toHaveText('Sam Mentor');
		await expect(third.locator('option:checked')).toHaveText('Alex Mentor');
		await expect(page.getByLabel('First choice reason')).toHaveValue(
			'Worked together at the mixer'
		);

		// Revise: pick Sam (currently the second choice) into the first choice.
		// That should swap the two rather than being blocked as a duplicate.
		await first.selectOption({ value: idFor('Sam Mentor') });
		await page.getByLabel('First choice reason').fill('Changed my mind after the mixer');

		await page.getByRole('button', { name: 'Save my choices' }).click();
		await expect(page.getByText('Saved.')).toBeVisible();

		await page.reload();
		await expect(first.locator('option:checked')).toHaveText('Sam Mentor');
		await expect(second.locator('option:checked')).toHaveText('Priya Mentor');
		await expect(third.locator('option:checked')).toHaveText('Alex Mentor');
		await expect(page.getByLabel('First choice reason')).toHaveValue(
			'Changed my mind after the mixer'
		);
	});

	test('rejects a submission missing a reason', async ({ page }) => {
		await page.goto(`/member/${tokenFor('Jordan Mentee')}`);

		await page
			.getByLabel('First choice', { exact: true })
			.selectOption({ value: idFor('Priya Mentor') });
		await page
			.getByLabel('Second choice', { exact: true })
			.selectOption({ value: idFor('Sam Mentor') });
		await page
			.getByLabel('Third choice', { exact: true })
			.selectOption({ value: idFor('Alex Mentor') });
		// Explicitly blank, rather than assumed blank: an earlier test in this
		// file may already have saved a submission for this same member, which
		// would otherwise pre-fill these from the database.
		await page.getByLabel('First choice reason').fill('Only one reason given');
		await page.getByLabel('Second choice reason').fill('');
		await page.getByLabel('Third choice reason').fill('');

		await page.getByRole('button', { name: 'Save my choices' }).click();
		await expect(page.getByText('Give a reason for each choice.')).toBeVisible();
	});
});
