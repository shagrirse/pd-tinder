<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { createPendingSubmit } from '$lib/actions/pendingSubmit.svelte';

	let { data, form } = $props();

	const CLOSED_MESSAGE = 'The preference form is closed. Reopen it on the Members page first.';

	const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

	// The roster role whose names a list holds, and the form section that offers them.
	const LISTS = [
		{ role: 'mentee', section: 'Mentor section', question: 'Choice of Mentee' },
		{ role: 'mentor', section: 'Mentee section', question: 'Choice of Mentor' }
	] as const;

	let report = $derived(form?.report ?? null);
	let blocked = $derived((report?.blocking.length ?? 0) > 0);
	// The server collects ID errors before the others, so restore file order here.
	let skipped = $derived(report ? [...report.errors].sort((a, b) => a.response - b.response) : []);
	// One response can fail in several ways, so count responses, not messages.
	let skippedCount = $derived(new Set(skipped.map((issue) => issue.response)).size);
	// The closed notice already says this, so the alert would only repeat it.
	let showError = $derived(
		!!form?.error && !(data.status === 'closed' && form.error === CLOSED_MESSAGE)
	);

	const validate = createPendingSubmit();
	const commit = createPendingSubmit();

	// The step whose form was last submitted, so an error shows where the admin is
	// looking. A failed commit drops the report, and an alert at the top of the page
	// would be off-screen. Without JavaScript the page reloads at the top, so it stays there.
	let lastAction = $state<'validate' | 'commit' | null>(null);
	const submitValidate: SubmitFunction = (input) => {
		lastAction = 'validate';
		return validate.submit(input);
	};
	const submitCommit: SubmitFunction = (input) => {
		lastAction = 'commit';
		return commit.submit(input);
	};
</script>

<section class="wrap">
	<header class="page-head">
		<p class="eyebrow">Admin</p>
		<h1>
			Import responses{#if data.cycle}<span class="cycle-name"
					>&nbsp;&middot; {data.cycle.name}</span
				>{/if}
		</h1>
		{#if data.cycle}
			<p class="lede">
				Bring the pairing preference form's Google Form export into this cycle. Nothing is saved
				until you confirm the report.
			</p>
		{/if}
	</header>

	{#if data.cycle === null}
		<p class="notice">No active cycle. Open one before importing preference responses.</p>
	{:else}
		{#snippet alert()}<p class="form-error" role="alert">{form?.error}</p>{/snippet}

		{#if showError && lastAction === null}{@render alert()}{/if}

		<div class="panel">
			<h2 class="panel-head">1 &middot; Fill the form's dropdowns</h2>
			<p class="panel-note">
				Paste each list into its section's three choice questions, so every answer matches a roster
				name exactly.
			</p>
			<div class="option-grid">
				{#each LISTS as list (list.role)}
					{@const summary = data.options?.[list.role]}
					<div class="option">
						<p class="option-dest">{list.section}</p>
						<p class="option-note">
							Options for each &ldquo;{list.question}&rdquo; question.
						</p>
						{#if summary && summary.duplicates.length > 0}
							<p class="warn-inline option-warn">
								Repeated on the roster:
								{summary.duplicates.map((d) => `${d.name} (${d.count})`).join(', ')}. Make these
								names distinct first. The import is refused while they repeat.
							</p>
						{/if}
						<div class="option-action">
							<a
								class="btn btn-ghost"
								href={resolve('/admin/members/import/options/[role]', { role: list.role })}
								download>Download {list.role} names</a
							>
							<span class="option-count">{plural(summary?.count ?? 0, 'name', 'names')}</span>
						</div>
					</div>
				{/each}
			</div>
		</div>

		<div class="panel">
			<h2 class="panel-head">2 &middot; Upload the responses</h2>
			{#if data.status === 'closed'}
				<p class="closed-note">{CLOSED_MESSAGE}</p>
				<a class="btn btn-ghost" href={resolve('/admin/members')}>Back to Members</a>
			{:else}
				<p class="panel-note">
					In the form's Responses tab, download the responses as a CSV file, then upload it here.
				</p>
				<form
					method="POST"
					action="?/validate"
					enctype="multipart/form-data"
					class="upload-form"
					use:enhance={submitValidate}
				>
					<label class="field">
						<span class="field-label">Google Form responses CSV file</span>
						<input name="file" type="file" accept=".csv,text/csv" required />
					</label>
					<button type="submit" class="btn btn-primary" disabled={validate.pending}>
						{validate.pending ? 'Validating\u2026' : 'Validate responses'}
					</button>
				</form>
				{#if showError && lastAction === 'validate'}{@render alert()}{/if}
			{/if}
		</div>

		{#if form?.committed}
			<div class="panel panel-done">
				<h2 class="panel-head">3 &middot; Import complete</h2>
				<p class="done-body">
					{form.committed.imported} imported, {form.committed.replaced} replaced.
				</p>
				<a class="btn btn-primary" href={resolve('/admin/members')}>Back to Members</a>
			</div>
		{:else if report}
			<div class="panel">
				<div class="report-head">
					<h2 class="panel-head">3 &middot; Review and import</h2>
					{#if form?.fileName}<span class="file-name">{form.fileName}</span>{/if}
				</div>

				{#if blocked}
					<div class="report-block errors">
						<h3 class="block-title">Nothing was staged. Fix these and upload again:</h3>
						<ul>
							{#each report.blocking as message (message)}<li>{message}</li>{/each}
						</ul>
					</div>
				{:else}
					<p class="headline">
						{plural(report.toImport, 'response', 'responses')} ready to import
					</p>
					{#if skippedCount > 0 || report.toReplace > 0 || report.superseded > 0}
						<ul class="tally">
							{#if skippedCount > 0}<li class="tally-skip">{skippedCount} skipped</li>{/if}
							{#if report.toReplace > 0}
								<li class="tally-replace">{report.toReplace} will replace existing choices</li>
							{/if}
							{#if report.superseded > 0}
								<li class="tally-ignored">
									{plural(
										report.superseded,
										'earlier duplicate response',
										'earlier duplicate responses'
									)}
									ignored
								</li>
							{/if}
						</ul>
					{/if}
				{/if}

				{#if skipped.length > 0}
					<div class="report-block errors">
						<h3 class="report-title">Skipped</h3>
						<ul class="issues">
							{#each skipped as issue (`${issue.response}:${issue.message}`)}
								<li>
									<span class="issue-ref">Response {issue.response} &middot; {issue.who}:</span>
									<span>{issue.message}</span>
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if report.warnings.length > 0}
					<div class="report-block warnings">
						<h3 class="report-title">Warnings</h3>
						<ul class="issues">
							{#each report.warnings as issue (`${issue.response}:${issue.message}`)}
								<li>
									<span class="issue-ref">Response {issue.response} &middot; {issue.who}:</span>
									<span>{issue.message}</span>
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if report.notYetSubmitted.length > 0}
					<div class="report-block">
						<h3 class="report-title">No choices yet</h3>
						<ul class="names">
							{#each report.notYetSubmitted as name, i (`${i}:${name}`)}
								<li>{name}</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if report.unmappedHeaders.length > 0}
					<p class="extra-columns">
						{plural(report.unmappedHeaders.length, 'extra column', 'extra columns')} will be ignored:
						{report.unmappedHeaders.join(', ')}
					</p>
				{/if}

				{#if !blocked && form?.token}
					<form method="POST" action="?/commit" class="confirm-form" use:enhance={submitCommit}>
						<input type="hidden" name="token" value={form.token} />
						<button type="submit" class="btn btn-primary" disabled={commit.pending}>
							{commit.pending
								? 'Importing\u2026'
								: `Import ${plural(report.toImport, 'response', 'responses')}`}
						</button>
						<span class="confirm-note">Nothing has been written yet.</span>
					</form>
				{/if}
			</div>
		{:else if showError && lastAction === 'commit'}
			<div class="panel">
				<h2 class="panel-head">3 &middot; Review and import</h2>
				{@render alert()}
			</div>
		{/if}
	{/if}
</section>

<style>
	.wrap {
		max-width: 46rem;
		margin: 0 auto;
		padding: 2rem 1.25rem 4rem;
	}
	.page-head {
		margin-bottom: 1.75rem;
	}
	h1 {
		font-size: 2.1rem;
		margin: 0;
	}
	.cycle-name {
		color: var(--text-dim);
		font-style: italic;
		font-weight: 400;
	}
	.lede {
		margin: 0.5rem 0 0;
		max-width: 38rem;
		color: var(--text-dim);
	}
	.notice {
		color: var(--text-dim);
	}
	.form-error {
		background: var(--danger-soft);
		color: var(--danger-text);
		border: 1px solid var(--danger);
		border-radius: var(--radius-sm);
		padding: 0.7rem 0.9rem;
		margin-bottom: 1.25rem;
	}
	.panel .form-error {
		margin: 1rem 0 0;
	}
	.panel .panel-head + .form-error {
		margin-top: 0;
	}

	.panel {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		padding: 1rem 1.1rem;
		margin-bottom: 1.25rem;
	}
	.panel-done {
		border-color: var(--like);
		background: var(--like-soft);
	}
	/* An h2 for the outline, set like the other admin pages' panel heads. */
	.panel-head {
		font-family: var(--font-body);
		font-weight: 700;
		font-size: 0.9rem;
		margin: 0 0 1rem;
	}
	.panel-note {
		color: var(--text-dim);
		font-size: 0.9rem;
		margin: -0.4rem 0 1rem;
	}
	.done-body {
		color: var(--text-dim);
		margin: 0 0 0.9rem;
	}

	/* Step 1: each list is headed by where it goes, so the crossover is hard to miss. */
	.option-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		gap: 0.75rem;
	}
	.option {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		background: var(--bg-raised-2);
		border-radius: var(--radius-sm);
		padding: 0.9rem 1rem 1rem;
	}
	.option-dest {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1.4rem;
		line-height: 1.15;
		margin: 0 0 0.3rem;
	}
	.option-note {
		font-size: 0.85rem;
		color: var(--text-dim);
		margin: 0 0 0.9rem;
	}
	.option-action {
		margin-top: auto;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 0.8rem;
	}
	.option-count {
		font-size: 0.8rem;
		color: var(--text-faint);
	}
	.warn-inline {
		font-size: 0.85rem;
		color: var(--meh);
	}
	.option-warn {
		margin: 0 0 0.9rem;
	}

	/* Step 2 */
	.closed-note {
		color: var(--text-dim);
		margin: 0 0 0.9rem;
	}
	.upload-form {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1rem;
		align-items: end;
	}
	@media (min-width: 36rem) {
		.upload-form {
			grid-template-columns: minmax(0, 1fr) auto;
		}
	}
	.upload-form input[type='file'] {
		background: var(--bg-raised-2);
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
		color: var(--text);
		font: inherit;
		padding: 0.7rem 0.9rem;
		min-height: 46px;
		width: 100%;
		min-width: 0;
	}

	/* Step 3 */
	.report-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 0 0.75rem;
	}
	.file-name {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-faint);
		margin-bottom: 1rem;
		overflow-wrap: anywhere;
	}
	.headline {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1.6rem;
		line-height: 1.2;
		margin: 0 0 0.5rem;
	}
	.tally {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 1.1rem;
		margin: 0 0 1.25rem;
		padding: 0;
		font-size: 0.88rem;
		color: var(--text-dim);
	}
	.tally li {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
	}
	.tally li::before {
		content: '';
		width: 0.5rem;
		height: 0.5rem;
		border-radius: var(--radius-pill);
		background: var(--text-faint);
	}
	.tally .tally-skip::before {
		background: var(--danger-text);
	}
	.tally .tally-replace::before {
		background: var(--meh);
	}

	.report-block {
		margin-bottom: 1.1rem;
	}
	.report-title {
		font-family: var(--font-mono);
		font-weight: 400;
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-faint);
		margin: 0 0 0.5rem;
	}
	.report-block ul {
		margin: 0;
		padding-left: 1.1rem;
		font-size: 0.88rem;
		line-height: 1.6;
	}
	.report-block.errors {
		border-left: 3px solid var(--danger);
		padding-left: 0.9rem;
	}
	.report-block.errors .report-title {
		color: var(--danger-text);
	}
	.block-title {
		font-family: var(--font-body);
		font-size: 0.95rem;
		color: var(--danger-text);
		margin: 0 0 0.5rem;
	}
	.report-block.warnings {
		border-left: 3px solid var(--meh);
		padding-left: 0.9rem;
	}
	.report-block .issues {
		list-style: none;
		padding-left: 0;
	}
	.issues li + li {
		margin-top: 0.3rem;
	}
	.issue-ref {
		color: var(--text-dim);
	}
	.report-block .names {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		padding-left: 0;
	}
	.names li {
		background: var(--bg-raised-2);
		border-radius: var(--radius-sm);
		padding: 0.2rem 0.6rem;
	}
	.extra-columns {
		font-size: 0.8rem;
		color: var(--text-faint);
		margin: 0 0 1rem;
		overflow-wrap: anywhere;
	}

	.confirm-form {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		flex-wrap: wrap;
		border-top: 1px solid var(--line);
		padding-top: 1rem;
	}
	.confirm-note {
		font-size: 0.8rem;
		color: var(--text-faint);
	}
</style>
