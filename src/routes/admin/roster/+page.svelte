<script lang="ts">
	import { untrack } from 'svelte';

	let { data, form } = $props();

	// One shared cycle selection feeds both panels and the roster list below.
	// Initialised once from the load data; later cycles can only change via
	// navigation, which remounts the page anyway.
	let selectedCycleId = $state<number | null>(untrack(() => data.cycles[0]?.id ?? null));

	const statusLabel: Record<string, string> = {
		draft: 'Draft',
		reviewing: 'Reviewing',
		closed: 'Closed'
	};

	let selectedCycle = $derived(data.cycles.find((c) => c.id === Number(selectedCycleId)) ?? null);
	let roster = $derived(
		selectedCycleId === null ? null : (data.rosters[selectedCycleId] ?? null)
	);

	let mentees = $derived(form && form.stage === 'validateMentees' ? form : null);
	let mentors = $derived(form && form.stage === 'validateMentors' ? form : null);
	let mentorCommit = $derived(form && form.stage === 'commitMentors' ? form : null);
	let menteeCommit = $derived(form && form.stage === 'commitMentees' ? form : null);
	let mentorDone = $derived(mentorCommit?.committed ?? null);
	let menteeDone = $derived(menteeCommit?.committed ?? null);
</script>

<section class="wrap">
	<header class="page-head">
		<p class="eyebrow">Admin</p>
		<h1>Pairing roster</h1>
	</header>

	{#if data.cycles.length === 0}
		<p class="notice">
			No recruitment cycle exists yet. Create one before importing a roster.
		</p>
	{:else}
		<div class="panel">
			<div class="panel-head">
				<span>Mentors</span>
				<span class="file-name">Selected mentors — full_name, email, industry, student_id</span>
			</div>

			{#if mentors?.error}<p class="form-error" role="alert">{mentors.error}</p>{/if}
			{#if mentorCommit?.error}<p class="form-error" role="alert">{mentorCommit.error}</p>{/if}

			{#if mentorDone}
				<p class="done-title">Roster updated</p>
				<p class="done-body">
					{mentorDone.inserted} mentor{mentorDone.inserted === 1 ? '' : 's'} added,
					{mentorDone.updated} updated.
				</p>
			{/if}

			<form method="POST" action="?/validateMentors" enctype="multipart/form-data" class="upload-form">
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

				<button type="submit" class="btn btn-primary">Validate mentors</button>
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
					<form method="POST" action="?/commitMentors" class="upload-form">
						<input type="hidden" name="token" value={mentors?.token ?? ''} />
						<button type="submit" class="btn btn-primary">
							Import {report.rowCount} mentor{report.rowCount === 1 ? '' : 's'}
						</button>
					</form>
				{/if}
			{/if}
		</div>

		<div class="panel">
			<div class="panel-head">
				<span>Mentees</span>
				<span class="file-name">Selected mentees — student_id, industry</span>
			</div>

			{#if mentees?.error}<p class="form-error" role="alert">{mentees.error}</p>{/if}
			{#if menteeCommit?.error}<p class="form-error" role="alert">{menteeCommit.error}</p>{/if}

			{#if menteeDone}
				<p class="done-title">Roster updated</p>
				<p class="done-body">
					{menteeDone.inserted} mentee{menteeDone.inserted === 1 ? '' : 's'} added,
					{menteeDone.updated} updated.
				</p>
			{/if}

			<form method="POST" action="?/validateMentees" enctype="multipart/form-data" class="upload-form">
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

				<button type="submit" class="btn btn-primary">Validate mentees</button>
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
							{report.industryMismatches.length} of the mentees is confirmed into a
							different industry than their registered first choice. The roster wins.
						</p>
					{/if}
					<form method="POST" action="?/commitMentees" class="upload-form">
						<input type="hidden" name="token" value={mentees?.token ?? ''} />
						<button type="submit" class="btn btn-primary">
							Import {report.rowCount} mentee{report.rowCount === 1 ? '' : 's'}
						</button>
					</form>
				{/if}
			{/if}
		</div>

		<div class="panel">
			<div class="panel-head"><span>Current roster</span></div>

			{#if selectedCycle && roster}
				{#if roster.mentors.length === 0 && roster.mentees.length === 0}
					<p class="notice">No members imported for this cycle yet.</p>
				{:else}
					<p class="done-title">
						{roster.mentors.length} mentor{roster.mentors.length === 1 ? '' : 's'} ·
						{roster.mentees.length} mentee{roster.mentees.length === 1 ? '' : 's'}
					</p>

					<h2 class="roster-role">Mentors</h2>
					{#if roster.mentors.length === 0}
						<p class="notice">None yet.</p>
					{:else}
						<ul class="roster-list">
							{#each roster.mentors as member (member.id)}
								<li>
									{member.fullName} — {member.email} — {member.industry ?? 'No industry'} —
									{member.studentId ?? 'No student ID'}
								</li>
							{/each}
						</ul>
					{/if}

					<h2 class="roster-role">Mentees</h2>
					{#if roster.mentees.length === 0}
						<p class="notice">None yet.</p>
					{:else}
						<ul class="roster-list">
							{#each roster.mentees as member (member.id)}
								<li>
									{member.fullName} — {member.email} — {member.industry ?? 'No industry'} —
									{member.studentId ?? 'No student ID'}
									{#if member.applicantId === null} — not linked to an application{/if}
								</li>
							{/each}
						</ul>
					{/if}
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
		font-size: 2rem;
		margin: 0;
	}
	.notice {
		color: var(--text-dim);
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

	.report-list {
		margin: 0.5rem 0 1rem;
		padding-left: 1.1rem;
		font-size: 0.88rem;
		line-height: 1.6;
	}

	.roster-role {
		font-size: 1rem;
		margin: 1rem 0 0.4rem;
	}
	.roster-list {
		margin: 0;
		padding-left: 1.1rem;
		font-size: 0.88rem;
		line-height: 1.6;
	}
</style>
