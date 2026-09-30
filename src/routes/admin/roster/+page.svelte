<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import { createPendingSubmit } from '$lib/actions/pendingSubmit.svelte';

	let { data, form } = $props();

	// One shared cycle selection feeds both import panels.
	// Initialised once from the load data; later cycles can only change via
	// navigation, which remounts the page anyway.
	let selectedCycleId = $state<number | null>(untrack(() => data.cycles[0]?.id ?? null));

	const statusLabel: Record<string, string> = {
		draft: 'Draft',
		reviewing: 'Reviewing',
		closed: 'Closed'
	};

	let mentees = $derived(form && form.stage === 'validateMentees' ? form : null);
	let mentors = $derived(form && form.stage === 'validateMentors' ? form : null);
	let mentorCommit = $derived(form && form.stage === 'commitMentors' ? form : null);
	let menteeCommit = $derived(form && form.stage === 'commitMentees' ? form : null);
	let mentorDone = $derived(mentorCommit?.committed ?? null);

	const validateMentors = createPendingSubmit();
	const commitMentors = createPendingSubmit();
	const validateMentees = createPendingSubmit();
	const commitMentees = createPendingSubmit();

	let menteeDone = $derived(menteeCommit?.committed ?? null);

	const MENTOR_EXAMPLE_CSV =
		'full_name,email,industry,student_id,telegram,linkedin\nAda Mentor,ada.mentor@example.com,Tech,02000001,adamentor,ada-mentor\n';
	const MENTEE_EXAMPLE_CSV =
		'student_id,industry,full_name,email,telegram,linkedin\n01000001,Finance,Bo Mentee,bo.mentee@example.com,bomentee,bo-mentee\n';
	const mentorExampleHref = `data:text/csv;charset=utf-8,${encodeURIComponent(MENTOR_EXAMPLE_CSV)}`;
	const menteeExampleHref = `data:text/csv;charset=utf-8,${encodeURIComponent(MENTEE_EXAMPLE_CSV)}`;
</script>

<section class="wrap">
	<header class="page-head">
		<p class="eyebrow">Admin</p>
		<h1>Pairing roster</h1>
	</header>

	{#if data.cycles.length === 0}
		<p class="notice">No recruitment cycle exists yet. Create one before importing a roster.</p>
	{:else}
		{#if form?.error}<p class="form-error" role="alert">{form.error}</p>{/if}

		<div class="panel">
			<div class="panel-head">
				<span>Mentors</span>
			</div>

			<div class="csv-spec">
				<div class="csv-columns-head">
					<span class="field-label">Required columns</span>
					<a class="csv-example-link" href={mentorExampleHref} download="mentor-roster-example.csv">
						Download example CSV
					</a>
				</div>
				<p class="chip-row">
					<span class="chip">full_name</span>
					<span class="chip">email</span>
					<span class="chip">industry</span>
					<span class="chip">student_id</span>
					<span class="chip">telegram</span>
					<span class="chip">linkedin</span>
				</p>
				<p class="csv-note">telegram and linkedin are optional.</p>
			</div>

			{#if mentorDone}
				<p class="done-title">Roster updated</p>
				<p class="done-body">
					{mentorDone.inserted} mentor{mentorDone.inserted === 1 ? '' : 's'} added,
					{mentorDone.updated} updated.
				</p>
			{/if}

			<form
				method="POST"
				action="?/validateMentors"
				enctype="multipart/form-data"
				class="upload-form"
				use:enhance={validateMentors.submit}
			>
				<label class="field">
					<span class="field-label">Cycle</span>
					<select name="cycleId" bind:value={selectedCycleId} disabled={!!mentors?.token}>
						{#each data.cycles as cycle (cycle.id)}
							<option value={cycle.id}>
								{cycle.name} ({cycle.year}) — {statusLabel[cycle.status]}
							</option>
						{/each}
					</select>
				</label>

				<label class="field">
					<span class="field-label">Mentor roster CSV file</span>
					<input name="file" type="file" accept=".csv,text/csv" required />
				</label>

				<button type="submit" class="btn btn-primary" disabled={validateMentors.pending}>
					{validateMentors.pending ? 'Validating…' : 'Validate mentors'}
				</button>
			</form>

			{#if mentors?.report}
				{@const report = mentors.report}
				{#if report.blocking.length > 0}
					<p class="warn-inline danger">Nothing was staged — fix these and upload again:</p>
					<ul class="report-list">
						{#each report.blocking as item}<li>{item}</li>{/each}
					</ul>
				{:else}
					<p class="done-title">Industries after normalisation</p>
					<ul class="report-list">
						{#each Object.entries(report.industryCounts) as [industry, count]}
							<li>{industry} · {count}</li>
						{/each}
					</ul>
					{#if report.invalidTelegrams > 0}
						<p class="warn-inline">
							{report.invalidTelegrams} telegram handle{report.invalidTelegrams === 1 ? '' : 's'}
							could not be normalised and will be left blank.
						</p>
					{/if}
					<form
						method="POST"
						action="?/commitMentors"
						class="upload-form"
						use:enhance={commitMentors.submit}
					>
						<input type="hidden" name="token" value={mentors?.token ?? ''} />
						<button type="submit" class="btn btn-primary" disabled={commitMentors.pending}>
							{commitMentors.pending
								? 'Importing…'
								: `Import ${report.rowCount} mentor${report.rowCount === 1 ? '' : 's'}`}
						</button>
					</form>
				{/if}
			{/if}
		</div>

		<div class="panel">
			<div class="panel-head">
				<span>Mentees</span>
			</div>

			<div class="csv-spec">
				<div class="csv-columns-head">
					<span class="field-label">Required columns</span>
					<a class="csv-example-link" href={menteeExampleHref} download="mentee-roster-example.csv">
						Download example CSV
					</a>
				</div>
				<p class="chip-row">
					<span class="chip">student_id</span>
					<span class="chip">industry</span>
					<span class="chip">full_name</span>
					<span class="chip">email</span>
					<span class="chip">telegram</span>
					<span class="chip">linkedin</span>
				</p>
				<p class="csv-note">
					full_name and email are required. Rows matching an application keep the application's
					identity; rows without a match create a new mentee from the CSV. telegram and linkedin are
					optional — blank values inherit from the application where one exists.
				</p>
			</div>

			{#if menteeDone}
				<p class="done-title">Roster updated</p>
				<p class="done-body">
					{menteeDone.inserted} mentee{menteeDone.inserted === 1 ? '' : 's'} added,
					{menteeDone.updated} updated.
				</p>
			{/if}

			<form
				method="POST"
				action="?/validateMentees"
				enctype="multipart/form-data"
				class="upload-form"
				use:enhance={validateMentees.submit}
			>
				<label class="field">
					<span class="field-label">Cycle</span>
					<select name="cycleId" bind:value={selectedCycleId} disabled={!!mentees?.token}>
						{#each data.cycles as cycle (cycle.id)}
							<option value={cycle.id}>
								{cycle.name} ({cycle.year}) — {statusLabel[cycle.status]}
							</option>
						{/each}
					</select>
				</label>

				<label class="field">
					<span class="field-label">Mentee roster CSV file</span>
					<input name="file" type="file" accept=".csv,text/csv" required />
				</label>

				<button type="submit" class="btn btn-primary" disabled={validateMentees.pending}>
					{validateMentees.pending ? 'Validating…' : 'Validate mentees'}
				</button>
			</form>

			{#if mentees?.report}
				{@const report = mentees.report}
				{#if report.blocking.length > 0}
					<p class="warn-inline danger">Nothing was staged — fix these and upload again:</p>
					<ul class="report-list">
						{#each report.blocking as item}<li>{item}</li>{/each}
					</ul>
				{:else}
					<p class="done-title">Industries after normalisation</p>
					<ul class="report-list">
						{#each Object.entries(report.industryCounts) as [industry, count]}
							<li>{industry} · {count}</li>
						{/each}
					</ul>
					{#if report.industryMismatches.length > 0}
						<p class="warn-inline">
							{report.industryMismatches.length} of the mentees is confirmed into a different industry
							than their registered first choice. The roster wins.
						</p>
					{/if}
					{#if report.newMentees.length > 0}
						<p class="warn-inline">
							{report.newMentees.length} mentee{report.newMentees.length === 1 ? '' : 's'} will be created
							— no prior application found.
						</p>
					{/if}
					{#if report.invalidTelegrams > 0}
						<p class="warn-inline">
							{report.invalidTelegrams} telegram handle{report.invalidTelegrams === 1 ? '' : 's'}
							could not be normalised and will be left blank.
						</p>
					{/if}
					<form
						method="POST"
						action="?/commitMentees"
						class="upload-form"
						use:enhance={commitMentees.submit}
					>
						<input type="hidden" name="token" value={mentees?.token ?? ''} />
						<button type="submit" class="btn btn-primary" disabled={commitMentees.pending}>
							{commitMentees.pending
								? 'Importing…'
								: `Import ${report.rowCount} mentee${report.rowCount === 1 ? '' : 's'}`}
						</button>
					</form>
				{/if}
			{/if}
		</div>
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

	.panel {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		padding: 1rem 1.1rem;
		margin-bottom: 1.25rem;
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
	.csv-spec {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin-bottom: 1rem;
	}
	.csv-columns-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.3rem 0.75rem;
	}
	.csv-example-link {
		font-size: 0.78rem;
		color: var(--text-dim);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.csv-example-link:hover {
		color: var(--flame);
	}
	.chip-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin: 0;
	}
	.csv-note {
		margin: 0;
		font-size: 0.8rem;
		color: var(--text-dim);
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
		color: var(--danger-text);
	}

	.report-list {
		margin: 0.5rem 0 1rem;
		padding-left: 1.1rem;
		font-size: 0.88rem;
		line-height: 1.6;
	}
</style>
