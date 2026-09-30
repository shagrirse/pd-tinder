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

/** The table row whose Name cell holds `name`. Other cells can name the same person. */
const rowOf = (page: Page, name: string) =>
	page.locator('tbody tr').filter({ has: page.locator('td.col-name', { hasText: name }) });

const firstName = (page: Page) => page.locator('tbody tr').first().locator('td.col-name');

/**
 * Priya Mentor and Jordan Mentee name each other first choice; Sam and Alex
 * (the other two seeded mentors) submit nothing, so reconciliation pairs
 * exactly one pair and leaves the other two mentors unpaired. Cleared and
 * re-seeded here so this file does not depend on preferences.spec.ts.
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

test.describe('members table', () => {
	test('lists every active member with a count', async ({ page }) => {
		await signIn(page);
		await page.goto('/admin/members');

		await expect(page.getByRole('heading', { level: 1 })).toHaveText(
			'Members · Mentee Recruitment 2026'
		);
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

const LONG_NAME = 'Muhammad Hafiz Bin Abdul Rahman Mohamed Ismail';

/**
 * Gives a seeded member a long name for the duration of `run`, since long
 * names are what widen the name columns. Restored afterwards so later tests
 * can still find them.
 */
async function withLongName(fullName: string, run: () => Promise<void>) {
	const db = new Database(E2E_DB);
	const rename = db.prepare('update members set full_name = ? where full_name = ?');
	rename.run(LONG_NAME, fullName);
	try {
		await run();
	} finally {
		rename.run(fullName, LONG_NAME);
		db.close();
	}
}

const tableBox = (page: Page) => page.getByRole('region', { name: 'Members table' });

test.describe('members table layout', () => {
	test('keeps the other columns reachable beside the pinned name on a phone', async ({ page }) => {
		await withLongName('Sam Mentor', async () => {
			await signIn(page);
			await page.goto('/admin/members');
			await tableBox(page).evaluate((el) => (el.scrollLeft = el.scrollWidth));

			const name = await page.getByRole('columnheader', { name: 'Name' }).boundingBox();
			const method = await page.getByRole('columnheader', { name: 'Method' }).boundingBox();
			expect(method!.x).toBeGreaterThanOrEqual(name!.x + name!.width);
		});
	});

	test('keeps the same height whatever the filters match', async ({ page }) => {
		await signIn(page);
		await page.goto('/admin/members');
		const before = (await tableBox(page).boundingBox())!.height;

		await page.getByLabel('Search').fill('nobody at all');
		await expect(page.getByText('Showing 0 of 4')).toBeVisible();
		expect((await tableBox(page).boundingBox())!.height).toBe(before);
	});

	test.describe('on a desktop', () => {
		test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });

		test('fits every column without scrolling sideways', async ({ page }) => {
			// Paired, so the long name fills both the Name and Paired with columns.
			seedMutualFirstChoice();
			await withLongName('Jordan Mentee', async () => {
				await signIn(page);
				await page.goto('/admin/members');
				await page.getByRole('button', { name: 'Run reconciliation' }).click();
				await expect(rowOf(page, 'Priya Mentor').getByText(LONG_NAME)).toBeVisible();
				const { scrollWidth, clientWidth } = await tableBox(page).evaluate((el) => ({
					scrollWidth: el.scrollWidth,
					clientWidth: el.clientWidth
				}));
				expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
			});
		});
	});
});

test.describe('pairing on the members page', () => {
	test('redirects the old pairing page here', async ({ page }) => {
		await signIn(page);
		await page.goto('/admin/pairing');
		await expect(page).toHaveURL(/\/admin\/members$/);
	});

	test('shows submission status and runs reconciliation into the table', async ({ page }) => {
		seedMutualFirstChoice();
		await signIn(page);
		await page.goto('/admin/members');

		const formCard = page.locator('.panel', { hasText: 'Preference form' });
		await expect(formCard.getByText('Open', { exact: true })).toBeVisible();
		await expect(formCard.getByText('2 of 4 submitted')).toBeVisible();

		// No baseline yet, so pairing from the modal is locked.
		await rowOf(page, 'Sam Mentor').getByRole('button', { name: 'Sam Mentor' }).click();
		const lockedModal = page.getByRole('dialog');
		await expect(lockedModal.getByRole('button', { name: 'Pair with…' })).toBeDisabled();
		await expect(lockedModal.getByText(/Close the preference form first/)).toBeVisible();
		await page.keyboard.press('Escape');

		await page.getByLabel('Pairing').selectOption('not_submitted');
		await expect(page.getByText('Showing 2 of 4')).toBeVisible();
		await expect(rowOf(page, 'Sam Mentor')).toBeVisible();
		await expect(rowOf(page, 'Alex Mentor')).toBeVisible();
		await page.getByRole('button', { name: 'Reset filters' }).click();

		await page.getByRole('button', { name: 'Run reconciliation' }).click();
		await expect(rowOf(page, 'Priya Mentor').getByText('Jordan Mentee')).toBeVisible();
		await expect(rowOf(page, 'Priya Mentor').getByText('Mutual · first choice')).toBeVisible();

		await page.getByLabel('Pairing').selectOption('unpaired');
		await expect(page.getByText('Showing 2 of 4')).toBeVisible();
		await expect(rowOf(page, 'Sam Mentor')).toBeVisible();
		await expect(rowOf(page, 'Alex Mentor')).toBeVisible();
	});

	test('closing the form saves a baseline and unlocks overrides', async ({ page }) => {
		await signIn(page);
		await page.goto('/admin/members');

		await page.getByRole('button', { name: 'Close form' }).click();
		const dialog = page.getByRole('dialog', { name: 'Close the preference form?' });
		await expect(dialog.getByText(/saves the baseline/)).toBeVisible();
		await dialog.getByRole('button', { name: 'Close form' }).click();

		await expect(page.getByText('Closed', { exact: true })).toBeVisible();
		await expect(page.getByText(/^Baseline saved /)).toBeVisible();
		await expect(page.getByRole('button', { name: 'Run reconciliation' })).toBeHidden();
		await rowOf(page, 'Sam Mentor').getByRole('button', { name: 'Sam Mentor' }).click();
		await expect(
			page.getByRole('dialog').getByRole('button', { name: 'Pair with…' })
		).toBeEnabled();
		await page.keyboard.press('Escape');

		// The server refuses a rerun while closed, even without the button.
		const result = await page.evaluate(async () => {
			const res = await fetch('/admin/members?/reconcile', {
				method: 'POST',
				headers: { 'x-sveltekit-action': 'true' },
				body: new FormData()
			});
			return res.json();
		});
		expect(result).toMatchObject({ type: 'failure', status: 400 });
		expect(result.data).toContain(
			'The form is closed, so the pairings already reflect the saved baseline.'
		);

		// Closing rebuilt the live pairs from the frozen choices.
		await expect(rowOf(page, 'Priya Mentor').getByText('Jordan Mentee')).toBeVisible();
	});

	test('pairs from the member modal with a warning and a required reason', async ({ page }) => {
		await signIn(page);
		await page.goto('/admin/members');

		await rowOf(page, 'Sam Mentor').getByRole('button', { name: 'Sam Mentor' }).click();
		const modal = page.getByRole('dialog');
		await modal.getByRole('button', { name: 'Pair with…' }).click();
		await modal
			.getByLabel('Pair with')
			.selectOption({ label: 'Jordan Mentee — paired with Priya Mentor' });
		await expect(
			modal.getByText('This ends Priya Mentor ↔ Jordan Mentee. Priya Mentor returns to unpaired.')
		).toBeVisible();

		// Whitespace passes the browser's required check; the server rejects it,
		// and the error shows inside the modal, not behind it.
		await modal.getByLabel('Reason').fill('   ');
		await modal.getByRole('button', { name: 'Save pair' }).click();
		await expect(modal.getByText('An override needs a reason.')).toBeVisible();
		await expect(page.locator('section.wrap > .form-error')).toHaveCount(0);

		await modal.getByLabel('Reason').fill('Jordan asked to switch at the mixer');
		await modal.getByRole('button', { name: 'Save pair' }).click();

		// The modal stays on Sam and shows the new pair.
		await expect(modal.getByRole('heading', { name: 'Sam Mentor' })).toBeVisible();
		await expect(modal.getByRole('button', { name: 'Jordan Mentee' })).toBeVisible();
		await expect(modal.getByText('Manual')).toBeVisible();
		await expect(
			modal.getByText('Override reason: Jordan asked to switch at the mixer')
		).toBeVisible();

		// Clicking the partner switches the modal. Jordan's panel starts closed,
		// and shows the baseline pair beside the new one.
		await modal.getByRole('button', { name: 'Jordan Mentee' }).click();
		await expect(modal.getByRole('heading', { name: 'Jordan Mentee' })).toBeVisible();
		await expect(modal.getByRole('button', { name: 'Pair with…' })).toBeVisible();
		await expect(modal.getByLabel('Reason')).toHaveCount(0);
		await expect(modal.getByText('Priya Mentor · Mutual · first choice')).toBeVisible();
		await page.keyboard.press('Escape');

		await expect(rowOf(page, 'Sam Mentor').getByText('Manual')).toBeVisible();
		await page.getByLabel('Pairing').selectOption('unpaired');
		await expect(rowOf(page, 'Priya Mentor')).toBeVisible();
	});

	test('exports the pairings, the baseline and the override log', async ({ page }) => {
		await signIn(page);
		await page.goto('/admin/members');

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
		// Depends on the close above: the form is closed when this test starts.
		const jordanToken = tokenFor('Jordan Mentee');
		const closedResponse = await page.goto(`/member/${jordanToken}`);
		expect(closedResponse?.status()).toBe(404);

		await signIn(page);
		await page.goto('/admin/members');
		await page.getByRole('button', { name: 'Reopen form' }).click();
		await expect(page.getByText('Open', { exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Run reconciliation' })).toBeVisible();

		await page.goto(`/member/${jordanToken}`);
		await expect(page.getByRole('heading', { name: 'Rank your top three mentors' })).toBeVisible();
	});

	test('opens the member modal from a partner in the table', async ({ page }) => {
		seedMutualFirstChoice();
		await signIn(page);
		await page.goto('/admin/members');
		await page.getByRole('button', { name: 'Run reconciliation' }).click();

		await rowOf(page, 'Priya Mentor').getByRole('button', { name: 'Jordan Mentee' }).click();
		const modal = page.getByRole('dialog');
		await expect(modal.getByRole('heading', { name: 'Jordan Mentee' })).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(modal).toBeHidden();
	});

	test('cancelling or escaping the close-form dialog leaves the form open', async ({ page }) => {
		await signIn(page);
		await page.goto('/admin/members');

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

	test('flags already-paired partners in the modal without blocking the pick', async ({ page }) => {
		seedMutualFirstChoice();
		await signIn(page);
		await page.goto('/admin/members');
		await page.getByRole('button', { name: 'Run reconciliation' }).click();
		await expect(rowOf(page, 'Priya Mentor').getByText('Jordan Mentee')).toBeVisible();

		await rowOf(page, 'Alex Mentor').getByRole('button', { name: 'Alex Mentor' }).click();
		const modal = page.getByRole('dialog');
		await modal.getByRole('button', { name: 'Pair with…' }).click();
		const partner = modal.getByLabel('Pair with');
		await expect(partner.locator('option', { hasText: 'Jordan Mentee' })).toHaveText(
			'Jordan Mentee — paired with Priya Mentor'
		);

		await partner.selectOption({ label: 'Jordan Mentee — paired with Priya Mentor' });
		await modal.getByLabel('Reason').fill('Admin decided, logged explicitly');
		await modal.getByRole('button', { name: 'Save pair' }).click();
		await expect(modal.getByText('Manual')).toBeVisible();
		await page.keyboard.press('Escape');

		await expect(rowOf(page, 'Alex Mentor').getByText('Manual')).toBeVisible();
	});

	test('shows an accurate reconciliation caption', async ({ page }) => {
		await signIn(page);
		await page.goto('/admin/members');

		await expect(
			page.getByText(
				'Rebuilds pairings from current submissions. Manual overrides are preserved; every other pairing is recomputed.'
			)
		).toBeVisible();
	});
});
