import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { expect, test, type Page } from '@playwright/test';
import { E2E_DB } from './global-setup';

const ADMIN = { email: 'admin@example.com', password: 'admin-password-1' };

const HEADERS = [
	'Timestamp',
	'Full Name',
	'School Email Address',
	'School Admin ID',
	'I am a...',
	'First Choice of Mentee',
	'Reason for First Choice of Mentee',
	'Second Choice of Mentee',
	'Reason for Second Choice of Mentee',
	'Third Choice of Mentee',
	'Reason for Third Choice of Mentee',
	'First Choice of Mentor',
	'Reason for First Choice of Mentor',
	'Second Choice of Mentor',
	'Reason for Second Choice of Mentor',
	'Third Choice of Mentor',
	'Reason for Third Choice of Mentor'
];

const quote = (v: string) => `"${v.replace(/"/g, '""')}"`;
// Header cells are quoted too, as a real Google export quotes any header containing a comma.
const csv = (rows: Record<string, string>[], headers = HEADERS) =>
	Buffer.from(
		[
			headers.map(quote).join(','),
			...rows.map((r) => headers.map((h) => quote(r[h] ?? '')).join(','))
		].join('\n')
	);

const MENTORS = ['Import Mentor A', 'Import Mentor B', 'Import Mentor C'];
const MENTEES = ['Import Mentee A', 'Import Mentee B', 'Import Mentee C'];

const mentorResponse = {
	Timestamp: '2026/10/12 9:00:00 AM',
	'Full Name': 'Import Mentor A',
	'School Email Address': 'import-mentor-0@example.com',
	'School Admin ID': '07700001',
	'I am a...': 'Mentor',
	'First Choice of Mentee': MENTEES[0],
	'Reason for First Choice of Mentee': 'a',
	'Second Choice of Mentee': MENTEES[1],
	'Reason for Second Choice of Mentee': 'b',
	'Third Choice of Mentee': MENTEES[2],
	'Reason for Third Choice of Mentee': 'c'
};

// The leading zero is gone, as if the sheet had passed through Excel.
const menteeResponse = {
	Timestamp: '2026/10/12 9:05:00 AM',
	'Full Name': 'Import Mentee A',
	'School Email Address': 'import-mentee-0@example.com',
	'School Admin ID': '8800001',
	'I am a...': 'Mentee',
	'First Choice of Mentor': MENTORS[0],
	'Reason for First Choice of Mentor': 'a',
	'Second Choice of Mentor': MENTORS[1],
	'Reason for Second Choice of Mentor': 'b',
	'Third Choice of Mentor': MENTORS[2],
	'Reason for Third Choice of Mentor': 'c'
};

const strangerResponse = {
	...mentorResponse,
	'Full Name': 'Stranger',
	'School Admin ID': '09999999'
};

function seedRoster() {
	const db = new Database(E2E_DB);
	const insert = db.prepare(
		"insert into members (cycle_id, role, full_name, email, student_id, industry) values (1, ?, ?, ?, ?, 'Finance')"
	);
	MENTORS.forEach((n, i) =>
		insert.run('mentor', n, `import-mentor-${i}@example.com`, `0770000${i + 1}`)
	);
	MENTEES.forEach((n, i) =>
		insert.run('mentee', n, `import-mentee-${i}@example.com`, `0880000${i + 1}`)
	);
	db.close();
}

function cleanUp() {
	const db = new Database(E2E_DB);
	const found = db.prepare("select id from members where full_name like 'Import %'").all() as {
		id: number;
	}[];
	if (found.length > 0) {
		const list = found.map((r) => r.id).join(',');
		db.exec(
			`delete from preferences where member_id in (${list}) or choice_member_id in (${list}); delete from members where id in (${list});`
		);
	}
	db.exec('update cycles set preferences_closed_at = null where id = 1');
	db.close();
}

async function signIn(page: Page) {
	await page.goto('/login');
	await page.getByLabel('Email').fill(ADMIN.email);
	await page.getByLabel('Password').fill(ADMIN.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
}

const rowOf = (page: Page, name: string) =>
	page.locator('tbody tr').filter({ has: page.locator('td.col-name', { hasText: name }) });

test.beforeEach(() => {
	cleanUp();
	seedRoster();
});
test.afterEach(() => cleanUp());

test.describe('preference response import', () => {
	test('imports responses, marks members submitted, and re-importing replaces', async ({
		page
	}) => {
		await signIn(page);
		await page.goto('/admin/members');
		await page.getByRole('link', { name: 'Import responses' }).click();
		await expect(page.getByRole('heading', { level: 1, name: 'Import responses' })).toBeVisible();
		// A child of Members: its nav item is lit, but aria-current stays on exact matches only.
		await expect(page.locator('.app-nav a[href="/admin/members"]')).toHaveClass(/\bactive\b/);
		await expect(page.locator('.app-nav a[href="/admin/import"]')).not.toHaveClass(/\bactive\b/);
		await expect(page.locator('.app-nav a[aria-current="page"]')).toHaveCount(0);

		const downloadPromise = page.waitForEvent('download');
		await page.getByRole('link', { name: 'Download mentee names' }).click();
		const download = await downloadPromise;
		const path = await download.path();
		expect(download.suggestedFilename()).toBe('mentee-names.txt');
		expect(path ? readFileSync(path, 'utf8') : '').toContain('Import Mentee A\n');

		const upload = {
			name: 'responses.csv',
			mimeType: 'text/csv',
			buffer: csv([mentorResponse, menteeResponse, strangerResponse])
		};
		await page.getByLabel('Google Form responses CSV file').setInputFiles(upload);
		await page.getByRole('button', { name: 'Validate responses' }).click();

		await expect(page.getByText('2 responses ready to import')).toBeVisible();
		await expect(page.getByText('1 skipped')).toBeVisible();
		await expect(page.getByText('School Admin ID "09999999" is not on the roster.')).toBeVisible();
		await expect(page.getByText('No choices yet')).toBeVisible();
		await expect(page.getByText('Import Mentor B')).toBeVisible();

		await page.getByRole('button', { name: 'Import 2 responses' }).click();
		await expect(page.getByText('2 imported, 0 replaced.')).toBeVisible();

		await page.getByRole('link', { name: 'Back to Members' }).click();
		await expect(
			rowOf(page, 'Import Mentor A').getByRole('img', { name: 'Submitted' })
		).toBeVisible();
		await expect(
			rowOf(page, 'Import Mentee A').getByRole('img', { name: 'Submitted' })
		).toBeVisible();
		await expect(
			rowOf(page, 'Import Mentor B').getByRole('img', { name: 'Not submitted' })
		).toBeVisible();

		await page.getByRole('link', { name: 'Import responses' }).click();
		await page.getByLabel('Google Form responses CSV file').setInputFiles(upload);
		await page.getByRole('button', { name: 'Validate responses' }).click();
		await expect(page.getByText('2 will replace existing choices')).toBeVisible();
	});

	test('blocks a file with a missing column and offers no import', async ({ page }) => {
		await signIn(page);
		await page.goto('/admin/members/import');

		await page.getByLabel('Google Form responses CSV file').setInputFiles({
			name: 'responses.csv',
			mimeType: 'text/csv',
			buffer: csv(
				[mentorResponse],
				HEADERS.filter((h) => h !== 'Reason for Third Choice of Mentor')
			)
		});
		await page.getByRole('button', { name: 'Validate responses' }).click();

		await expect(page.getByText('Nothing was staged. Fix these and upload again:')).toBeVisible();
		await expect(page.getByText(/Missing columns/)).toBeVisible();
		await expect(page.getByRole('button', { name: /^Import \d+ response/ })).toHaveCount(0);
	});

	test('reports a file that is not a readable CSV instead of failing the page', async ({
		page
	}) => {
		await signIn(page);
		await page.goto('/admin/members/import');
		await page.getByLabel('Google Form responses CSV file').setInputFiles({
			name: 'responses.csv',
			mimeType: 'text/csv',
			buffer: Buffer.from('a,"b')
		});
		await page.getByRole('button', { name: 'Validate responses' }).click();

		await expect(
			page.getByText(
				'That file could not be read as a CSV. If you downloaded a .zip, unzip it and upload the .csv inside.'
			)
		).toBeVisible();
		await expect(page.getByRole('heading', { level: 1, name: 'Import responses' })).toBeVisible();
	});

	test('shows a failed commit in the review step, where the import button was', async ({
		page
	}) => {
		await signIn(page);
		await page.goto('/admin/members/import');
		await page.getByLabel('Google Form responses CSV file').setInputFiles({
			name: 'responses.csv',
			mimeType: 'text/csv',
			buffer: csv([mentorResponse, menteeResponse])
		});
		await page.getByRole('button', { name: 'Validate responses' }).click();
		await expect(page.getByText('2 responses ready to import')).toBeVisible();

		// The roster changes under the staged file, so the commit no longer validates.
		cleanUp();
		await page.getByRole('button', { name: 'Import 2 responses' }).click();

		const reviewStep = page.locator('.panel', { hasText: '3 \u00b7 Review and import' });
		await expect(reviewStep.getByRole('alert')).toHaveText(
			'That file no longer validates. Upload it again.'
		);
		await expect(page.getByRole('alert')).toHaveCount(1);
	});

	test('refuses uploads and hides the entry point while the form is closed', async ({ page }) => {
		const db = new Database(E2E_DB);
		db.exec('update cycles set preferences_closed_at = unixepoch() where id = 1');
		db.close();

		await signIn(page);
		await page.goto('/admin/members');
		await expect(page.getByRole('link', { name: 'Import responses' })).toHaveCount(0);

		await page.goto('/admin/members/import');
		await expect(
			page.getByText('The preference form is closed. Reopen it on the Members page first.')
		).toBeVisible();
		await expect(page.getByRole('button', { name: 'Validate responses' })).toHaveCount(0);
	});
});
