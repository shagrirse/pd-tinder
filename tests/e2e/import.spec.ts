import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const ADMIN = { email: 'admin@example.com', password: 'admin-password-1' };
const REVIEWER = { email: 'reviewer@example.com', password: 'reviewer-password-1' };

const FIXTURE = 'tests/fixtures/applicants-sample.csv';

async function signIn(
	page: import('@playwright/test').Page,
	who: { email: string; password: string }
) {
	await page.goto('/login');
	await page.getByLabel('Email').fill(who.email);
	await page.getByLabel('Password').fill(who.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
}

/**
 * The fixture's header plus `rows` invented applicants, all with unique student IDs.
 *
 * Sized to land comfortably between the two limits that matter: well over
 * adapter-node's 512K default (so it proves the raised limit is doing the work)
 * and well under the 5M we set (so the test is not itself brushing the ceiling).
 * At 100 rows this produces roughly 880KB.
 */
function buildCsv(rows: number): string {
	const text = readFileSync(FIXTURE, 'utf8');
	const header = text.slice(0, text.indexOf('\n'));
	const filler = 'Reason text that exists only to make this file large. '.repeat(20);

	const lines = [header];
	for (let i = 0; i < rows; i++) {
		const id = String(2_000_000 + i);
		lines.push(
			[
				'2026/01/05 9:00:00 AM',
				`bulk${i}@example.com`,
				`Bulk Fictional ${i}`,
				'Female',
				id,
				`bulk${i}@example.smu.edu.sg`,
				'Finance',
				'Consulting',
				'Lee Kong Chian School of Business',
				'',
				'91230001',
				`@bulk${i}`,
				`https://www.linkedin.com/in/bulk-${i}`,
				"No, I'm new to TMC",
				`"${filler}"`,
				`"${filler}"`,
				`"${filler}"`,
				`"${filler}"`,
				`"${filler}"`,
				`"${filler}"`,
				`"${filler}"`,
				`"${filler}"`,
				'NIL'
			].join(',')
		);
	}
	return lines.join('\n') + '\n';
}

test.describe('import wizard', () => {
	test('validates the fixture and reports what it found', async ({ page }) => {
		await signIn(page, ADMIN);
		await page.goto('/admin/import');

		await page.getByLabel('CSV file').setInputFiles(FIXTURE);
		await page.getByRole('button', { name: 'Validate' }).click();

		await expect(page.getByText('Industries after normalisation')).toBeVisible();
		await expect(page.getByText('Finance · 2')).toBeVisible();
		await expect(page.getByRole('button', { name: /Import 2 applicants/ })).toBeVisible();
	});

	test('writes nothing until the import is confirmed', async ({ page }) => {
		await signIn(page, ADMIN);
		await page.goto('/admin/import');

		await page.getByLabel('CSV file').setInputFiles(FIXTURE);
		await page.getByRole('button', { name: 'Validate' }).click();
		await expect(page.getByText('Nothing has been written yet.')).toBeVisible();

		await page.getByRole('button', { name: /Import 2 applicants/ }).click();
		await expect(page.getByText('Import complete')).toBeVisible();
	});

	test('refuses a file with an unrecognised industry and offers no confirm', async ({ page }) => {
		await signIn(page, ADMIN);
		await page.goto('/admin/import');

		const text = readFileSync(FIXTURE, 'utf8').replace('Finance,Consulting', 'Aerospace,Consulting');
		await page.getByLabel('CSV file').setInputFiles({
			name: 'broken.csv',
			mimeType: 'text/csv',
			buffer: Buffer.from(text)
		});
		await page.getByRole('button', { name: 'Validate' }).click();

		await expect(page.getByText('This file cannot be imported yet')).toBeVisible();
		await expect(page.getByText(/Aerospace/)).toBeVisible();
		await expect(page.getByRole('button', { name: /^Import / })).toHaveCount(0);
	});

	test('accepts a file larger than the adapter default body limit', async ({ page }) => {
		const csv = buildCsv(100);
		const size = Buffer.byteLength(csv);
		expect(size).toBeGreaterThan(512 * 1024);
		expect(size).toBeLessThan(5 * 1024 * 1024);

		await signIn(page, ADMIN);
		await page.goto('/admin/import');

		await page.getByLabel('CSV file').setInputFiles({
			name: 'large.csv',
			mimeType: 'text/csv',
			buffer: Buffer.from(csv)
		});
		await page.getByRole('button', { name: 'Validate' }).click();

		// Validating never writes, so these 100 invented applicants do not enter the
		// shared end-to-end database and cannot disturb the other spec files.
		await expect(page.getByRole('button', { name: /Import 100 applicants/ })).toBeVisible();
	});

	test('blocks a reviewer from the import page', async ({ page }) => {
		await signIn(page, REVIEWER);
		const response = await page.goto('/admin/import');
		expect(response?.status()).toBe(403);
	});
});
