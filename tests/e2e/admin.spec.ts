import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import { E2E_DB } from './global-setup';

const ADMIN = { email: 'admin@example.com', password: 'admin-password-1' };

async function signIn(
	page: import('@playwright/test').Page,
	who: { email: string; password: string }
) {
	await page.goto('/login');
	await page.getByLabel('Email').fill(who.email);
	await page.getByLabel('Password').fill(who.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
}

/** Give applicant 1 a verdict from the seeded reviewer, so a ranked row exists. */
function seedVerdict() {
	const db = new Database(E2E_DB);
	const now = Math.floor(Date.now() / 1000);
	const question = db.prepare("select id from questions where key = 'q_why_tmc'").get() as {
		id: number;
	};

	db.prepare('delete from verdicts').run();
	db.prepare('delete from ratings').run();
	db.prepare('delete from claims').run();
	db.prepare(
		'insert into verdicts (user_id, applicant_id, overall, red_flag, note, submitted_at, updated_at) values (1, 1, ?, 0, ?, ?, ?)'
	).run('like', 'Strong answers throughout.', now, now);
	db.prepare(
		'insert into ratings (user_id, applicant_id, question_id, value) values (1, 1, ?, ?)'
	).run(question.id, 'like');
	db.close();
}

/**
 * Signing in as any reviewer redirects to /review, whose load immediately
 * claims that reviewer's next applicant (see claimNext in
 * src/lib/server/review/claim.ts). With only two applicants seeded and one
 * permanently held by seedVerdict()'s verdict, that claim is the last free
 * applicant — and it outlives its test (2-hour TTL). Clear it before each
 * people-management test so the fresh reviewer each test creates always has
 * one to claim, the same way seedVerdict() clears claims for the drill-down
 * tests above.
 */
function clearClaims() {
	const db = new Database(E2E_DB);
	db.exec('delete from claims;');
	db.close();
}

test.describe('admin drill-down', () => {
	test('opens an applicant and shows identity, note, and a rating', async ({ page }) => {
		seedVerdict();
		await signIn(page, ADMIN);
		await page.goto('/results');

		await page.getByRole('button', { name: 'Ada Fictional' }).click();

		const modal = page.getByRole('dialog', { name: 'Applicant detail' });
		await expect(modal).toBeVisible();
		await expect(modal.getByText('ada@example.com')).toBeVisible();
		await expect(modal.getByText('01000001')).toBeVisible();
		await expect(modal.getByText('Strong answers throughout.')).toBeVisible();
		await expect(modal.getByText('I want structured guidance.')).toBeVisible();

		// The Assessment section also shows a 'like' overall verdict tag, so scope to
		// the specific answer article to assert the per-question rating chip renders
		// (rather than just the answer text), avoiding a strict-mode collision.
		const ratedAnswer = modal.locator('article', { hasText: 'I want structured guidance.' });
		await expect(ratedAnswer.getByText('like', { exact: true })).toBeVisible();
	});

	test('closes on the close control', async ({ page }) => {
		seedVerdict();
		await signIn(page, ADMIN);
		await page.goto('/results');

		await page.getByRole('button', { name: 'Ada Fictional' }).click();
		const modal = page.getByRole('dialog', { name: 'Applicant detail' });
		await expect(modal).toBeVisible();

		await page.getByRole('button', { name: 'Close' }).click();
		await expect(modal).not.toBeVisible();
	});

	test('refuses to serve applicant detail to a reviewer', async ({ page }) => {
		await signIn(page, { email: 'reviewer@example.com', password: 'reviewer-password-1' });
		const response = await page.goto('/results/applicant/1');
		expect(response?.status()).toBe(403);
	});
});

test.describe('admin people management', () => {
	test.beforeEach(() => clearClaims());

	test('creates a reviewer whose invite link sets a password and opens a deck', async ({
		page,
		context
	}) => {
		const email = `created-${Date.now()}@example.com`;

		await signIn(page, ADMIN);
		await page.goto('/admin/people');

		await page.getByLabel('Name').fill('Created Reviewer');
		await page.getByLabel('Email').fill(email);
		await page.getByRole('checkbox', { name: 'Finance' }).check();
		await page.getByRole('button', { name: 'Create and issue invite' }).click();

		const inviteUrl = await page.getByText(/\/invite\//).first().innerText();
		expect(inviteUrl).toContain('/invite/');

		await expect(page.getByText(email)).toBeVisible();

		// Redeem in a clean context so the admin session is not reused.
		const fresh = await context.browser()!.newContext();
		const invitee = await fresh.newPage();
		await invitee.goto(inviteUrl);
		await invitee.getByLabel('Password').fill('a-brand-new-password');
		await invitee.getByRole('button', { name: 'Set password and sign in' }).click();

		await expect(invitee.getByRole('heading', { name: /Applicant #/ })).toBeVisible();
		await fresh.close();
	});

	test('rejects a duplicate email', async ({ page }) => {
		await signIn(page, ADMIN);
		await page.goto('/admin/people');

		await page.getByLabel('Name').fill('Duplicate');
		await page.getByLabel('Email').fill(ADMIN.email);
		await page.getByRole('button', { name: 'Create and issue invite' }).click();

		await expect(page.getByRole('alert')).toContainText('already exists');
	});

	test('blocks a reviewer from the people page', async ({ page }) => {
		await signIn(page, { email: 'reviewer@example.com', password: 'reviewer-password-1' });
		const response = await page.goto('/admin/people');
		expect(response?.status()).toBe(403);
	});

	test('deactivating blocks the sign-in but keeps the person on the roster', async ({
		page,
		context
	}) => {
		const email = `deactivated-${Date.now()}@example.com`;
		const password = 'a-perfectly-fine-password';

		await signIn(page, ADMIN);
		await page.goto('/admin/people');
		await page.getByLabel('Name').fill('Soon Deactivated');
		await page.getByLabel('Email').fill(email);
		await page.getByRole('checkbox', { name: 'Finance' }).check();
		await page.getByRole('button', { name: 'Create and issue invite' }).click();

		const inviteUrl = await page.getByText(/\/invite\//).first().innerText();

		// Set a password so this is a working account before it is revoked.
		const before = await context.browser()!.newContext();
		const beforePage = await before.newPage();
		await beforePage.goto(inviteUrl);
		await beforePage.getByLabel('Password').fill(password);
		await beforePage.getByRole('button', { name: 'Set password and sign in' }).click();
		await expect(beforePage.getByRole('heading', { name: /Applicant #/ })).toBeVisible();
		await before.close();

		// Revoke it.
		const row = page.getByRole('row', { name: new RegExp(email) });
		await row.getByRole('button', { name: 'Deactivate' }).click();
		// exact: default getByText matching is a case-insensitive substring match,
		// and the row's own email text (`deactivated-<timestamp>@example.com`)
		// contains "deactivated" too, so an inexact match resolves to both the
		// status tag and the email.
		await expect(row.getByText('Deactivated', { exact: true })).toBeVisible();

		// The record is preserved, not removed.
		await expect(page.getByText(email)).toBeVisible();

		// And the account no longer signs in.
		const after = await context.browser()!.newContext();
		const afterPage = await after.newPage();
		await signIn(afterPage, { email, password });
		await expect(afterPage.getByRole('alert')).toContainText('Incorrect email or password.');
		await after.close();
	});

	test('an admin cannot deactivate themselves', async ({ page }) => {
		await signIn(page, ADMIN);
		await page.goto('/admin/people');

		const ownRow = page.getByRole('row', { name: new RegExp(ADMIN.email) });
		await expect(ownRow.getByRole('button', { name: 'Deactivate' })).toHaveCount(0);
	});
});
