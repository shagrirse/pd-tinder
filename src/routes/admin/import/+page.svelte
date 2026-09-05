<script lang="ts">
	import { untrack } from 'svelte';

	let { data, form } = $props();

	// Initialised once from the load data; later cycles can only change via
	// navigation, which remounts the page anyway. untrack keeps this a snapshot
	// rather than a live subscription to `data`.
	let selectedCycleId = $state<number | null>(untrack(() => data.cycles[0]?.id ?? null));

	const statusLabel: Record<string, string> = {
		draft: 'Draft',
		reviewing: 'Reviewing',
		closed: 'Closed'
	};

	let selectedCycle = $derived(data.cycles.find((c) => c.id === Number(selectedCycleId)) ?? null);
	let blocked = $derived((form?.report?.blocking.length ?? 0) > 0);

	// The confirm step commits to the cycle the file was validated against
	// (form.cycleId), not whatever the dropdown happens to show — name it so
	// the admin can see exactly which cycle receives the import.
	let stagedCycleName = $derived.by(() => {
		const cycle = data.cycles.find((c) => c.id === Number(form?.cycleId));
		return cycle ? `${cycle.name} (${cycle.year})` : '';
	});
</script>

<section class="wrap">
	<header class="page-head">
		<p class="eyebrow">Admin</p>
		<h1>Import applicants</h1>
	</header>

	{#if data.cycles.length === 0}
		<p class="notice">
			No recruitment cycle exists yet. Create one before importing — cycles are seeded with
			<code>scripts/seed-dev.ts</code> for now.
		</p>
	{:else}
		{#if form?.error}<p class="form-error" role="alert">{form.error}</p>{/if}

		{#if form?.committed}
			<div class="panel panel-done">
				<p class="done-title">Import complete</p>
				<p class="done-body">
					{form.committed.inserted} applicant{form.committed.inserted === 1 ? '' : 's'} added,
					{form.committed.updated} updated.
				</p>
				<a class="btn btn-primary" href="/results">See results</a>
			</div>
		{/if}

		<div class="panel">
			<div class="panel-head"><span>1 · Choose a file</span></div>
			<form method="POST" action="?/validate" enctype="multipart/form-data" class="upload-form">
				<label class="field">
					<span class="field-label">Cycle</span>
					<!-- Locked once a token is staged: the commit step always targets the cycle chosen at validate time. -->
					<select name="cycleId" bind:value={selectedCycleId} disabled={!!form?.token}>
						{#each data.cycles as cycle (cycle.id)}
							<option value={cycle.id}>
								{cycle.name} ({cycle.year}) — {statusLabel[cycle.status]}
							</option>
						{/each}
					</select>
				</label>

				<label class="field">
					<span class="field-label">CSV file</span>
					<input name="file" type="file" accept=".csv,text/csv" required />
				</label>

				<button type="submit" class="btn btn-primary">Validate</button>
			</form>

			{#if selectedCycle?.status === 'reviewing'}
				<p class="warn-inline">
					This cycle is open for review. Importing now changes data reviewers may be holding —
					existing applicants are updated in place, not duplicated.
				</p>
			{:else if selectedCycle?.status === 'closed'}
				<p class="warn-inline danger">
					This cycle is closed. Importing into it is refused — reopen it first.
				</p>
			{/if}
		</div>

		{#if form?.report}
			{@const report = form.report}
			<div class="panel">
				<div class="panel-head">
					<span>2 · Review the report</span>
					{#if form.fileName}<span class="file-name">{form.fileName}</span>{/if}
				</div>

				{#if blocked}
					<div class="report-block errors">
						<p class="report-title">This file cannot be imported yet</p>
						<ul>
							{#each report.blocking as message (message)}
								<li>{message}</li>
							{/each}
						</ul>
					</div>
				{/if}

				<div class="stat-row">
					<div class="stat"><strong>{report.rowCount}</strong><span>Rows</span></div>
					<div class="stat"><strong>{report.linkedin.valid}</strong><span>LinkedIn ok</span></div>
					<div class="stat">
						<strong class:warn={report.linkedin.missing > 0}>{report.linkedin.missing}</strong>
						<span>No LinkedIn</span>
					</div>
				</div>

				<div class="report-block">
					<p class="report-title">Industries after normalisation</p>
					<div class="chips">
						{#each Object.entries(report.industryCounts) as [industry, count] (industry)}
							<span class="chip">{industry} · {count}</span>
						{/each}
					</div>
				</div>

				{#if report.duplicateStudentIds.length > 0}
					<div class="report-block warnings">
						<p class="report-title">Duplicate student IDs — the later row wins</p>
						<ul>
							{#each report.duplicateStudentIds as duplicate (duplicate.studentId)}
								<li>{duplicate.studentId} appears {duplicate.count} times</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if report.unmappedHeaders.length > 0}
					<div class="report-block warnings">
						<p class="report-title">Columns that will be ignored</p>
						<ul>
							{#each report.unmappedHeaders as header (header)}
								<li>{header}</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if form.token}
					<form method="POST" action="?/commit" class="confirm-form">
						<input type="hidden" name="token" value={form.token} />
						<button type="submit" class="btn btn-primary">
							Import {report.rowCount} applicants
						</button>
						{#if stagedCycleName}
							<span class="confirm-note">Importing into {stagedCycleName}.</span>
						{/if}
						<span class="confirm-note">Nothing has been written yet.</span>
					</form>
				{/if}
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
		font-size: 2rem;
		margin: 0;
	}
	.notice {
		color: var(--text-dim);
	}
	.notice code {
		font-family: var(--font-mono);
		font-size: 0.85em;
	}
	.form-error {
		background: var(--danger-soft);
		color: var(--danger);
		border: 1px solid var(--danger);
		border-radius: var(--radius-sm);
		padding: 0.7rem 0.9rem;
		margin-bottom: 1.25rem;
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
	.done-title {
		font-weight: 700;
		margin: 0 0 0.3rem;
	}
	.done-body {
		color: var(--text-dim);
		margin: 0 0 0.9rem;
	}
	.panel-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
		font-weight: 700;
		font-size: 0.9rem;
		margin-bottom: 1rem;
	}
	.file-name {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-faint);
	}

	.upload-form {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		gap: 1rem;
		align-items: end;
	}
	.upload-form select,
	.upload-form input[type='file'] {
		background: var(--bg-raised-2);
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
		color: var(--text);
		font: inherit;
		padding: 0.7rem 0.9rem;
		min-height: 46px;
	}
	.warn-inline {
		margin: 0.9rem 0 0;
		font-size: 0.85rem;
		color: var(--meh);
	}
	.warn-inline.danger {
		color: var(--danger);
	}

	.stat-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
		gap: 0.75rem;
		margin-bottom: 1rem;
	}
	.stat {
		background: var(--bg-raised-2);
		border-radius: var(--radius-sm);
		padding: 0.6rem 0.8rem;
	}
	.stat strong {
		display: block;
		font-family: var(--font-display);
		font-size: 1.4rem;
	}
	.stat strong.warn {
		color: var(--meh);
	}
	.stat span {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-faint);
	}

	.report-block {
		margin-bottom: 1rem;
	}
	.report-title {
		font-family: var(--font-mono);
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
		color: var(--danger);
	}
	.report-block.warnings {
		border-left: 3px solid var(--meh);
		padding-left: 0.9rem;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
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
