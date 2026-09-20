<!-- src/routes/admin/pairing/+page.svelte -->
<script lang="ts">
	let { data, form } = $props();

	const STATUS_LABEL: Record<string, string> = {
		not_opened: 'Not opened yet',
		open: 'Open',
		closed: 'Closed'
	};
	const STATUS_TAG: Record<string, string> = {
		not_opened: 'verdict-meh',
		open: 'verdict-like',
		closed: 'verdict-flag'
	};
	const METHOD_LABEL: Record<string, string> = {
		mutual_first: 'Mutual · first choice',
		mutual_any: 'Mutual · other rank',
		one_sided: 'One-sided',
		manual: 'Manual'
	};

	let totalRoster = $derived(data.submissions.submitted.length + data.submissions.notSubmitted.length);
</script>

<section class="wrap">
	<header class="page-head">
		<p class="eyebrow">Admin</p>
		<h1>Pairing{#if data.cycle}<span class="cycle-name"> · {data.cycle.name}</span>{/if}</h1>
	</header>

	{#if !data.cycle}
		<p class="notice">No active cycle. Open one before running the pairing round.</p>
	{:else}
		{#if form?.error}<p class="form-error" role="alert">{form.error}</p>{/if}

		<div class="panel">
			<div class="panel-head">
				<span>Form status</span>
				<span class="verdict-tag {STATUS_TAG[data.status]}">{STATUS_LABEL[data.status]}</span>
			</div>
			<p class="done-body">{data.submissions.submitted.length} of {totalRoster} submitted.</p>

			{#if data.submissions.notSubmitted.length > 0}
				<p class="field-label">Not submitted</p>
				<ul class="roster-list">
					{#each data.submissions.notSubmitted as member (member.id)}
						<li>{member.fullName} ({member.role})</li>
					{/each}
				</ul>
			{/if}

			{#if data.status === 'closed'}
				<form method="POST" action="?/reopen" class="inline-form">
					<button type="submit" class="btn btn-primary">Reopen form</button>
				</form>
			{:else if data.status === 'open'}
				<form method="POST" action="?/close" class="inline-form">
					<button type="submit" class="btn btn-danger">Close form</button>
				</form>
			{/if}
		</div>

		<div class="panel">
			<div class="panel-head"><span>Reconciliation</span></div>
			<form method="POST" action="?/reconcile" class="inline-form">
				<button type="submit" class="btn btn-primary">Run reconciliation</button>
			</form>

			{#if data.pairings.length === 0}
				<p class="notice">No pairs yet.</p>
			{:else}
				<div class="scroll">
					<table>
						<thead>
							<tr>
								<th>Mentor</th>
								<th>Mentee</th>
								<th>Method</th>
								<th>Reason</th>
							</tr>
						</thead>
						<tbody>
							{#each data.pairings as pair (pair.id)}
								<tr>
									<td>{pair.mentor.fullName}</td>
									<td>{pair.mentee.fullName}</td>
									<td><span class="chip">{METHOD_LABEL[pair.method]}</span></td>
									<td>{pair.overrideReason ?? ''}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>

		<div class="panel">
			<div class="panel-head"><span>Residual</span></div>

			<p class="field-label">Unpaired</p>
			{#if data.residual.unpaired.length === 0}
				<p class="notice">Nobody unpaired.</p>
			{:else}
				<ul class="roster-list">
					{#each data.residual.unpaired as member (member.id)}
						<li>{member.fullName} ({member.role})</li>
					{/each}
				</ul>
			{/if}

			<p class="field-label">Got none of their choices</p>
			{#if data.residual.gotNoChoice.length === 0}
				<p class="notice">Nobody.</p>
			{:else}
				<ul class="roster-list">
					{#each data.residual.gotNoChoice as member (member.id)}
						<li>{member.fullName} ({member.role})</li>
					{/each}
				</ul>
			{/if}
		</div>

		<div class="panel">
			<div class="panel-head"><span>Override a pair</span></div>
			<form method="POST" action="?/override" class="override-form">
				<label class="field">
					<span class="field-label">Mentor</span>
					<select name="mentorMemberId" required>
						<option value="">Choose a mentor</option>
						{#each data.mentors as mentor (mentor.id)}
							<option value={mentor.id}>{mentor.fullName}</option>
						{/each}
					</select>
				</label>
				<label class="field">
					<span class="field-label">Mentee</span>
					<select name="menteeMemberId" required>
						<option value="">Choose a mentee</option>
						{#each data.mentees as mentee (mentee.id)}
							<option value={mentee.id}>{mentee.fullName}</option>
						{/each}
					</select>
				</label>
				<label class="field">
					<span class="field-label">Reason</span>
					<textarea name="reason"></textarea>
				</label>
				<button type="submit" class="btn btn-primary">Save override</button>
			</form>
		</div>

		<div class="panel">
			<div class="panel-head"><span>Export</span></div>
			<a href="/admin/pairing/export" class="btn btn-ghost">Export CSV</a>
		</div>
	{/if}
</section>

<style>
	.wrap {
		max-width: 50rem;
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
	.cycle-name {
		color: var(--text-dim);
		font-style: italic;
		font-weight: 400;
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
	.panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		font-weight: 700;
		font-size: 0.9rem;
		margin-bottom: 1rem;
	}
	.done-body {
		color: var(--text-dim);
		margin: 0 0 0.9rem;
	}

	.inline-form {
		margin-top: 0.9rem;
	}

	.scroll {
		overflow-x: auto;
	}
	table {
		border-collapse: collapse;
		width: 100%;
	}
	th,
	td {
		text-align: left;
		padding: 0.6rem 0.7rem;
		border-bottom: 1px solid var(--line);
		font-size: 0.88rem;
		vertical-align: top;
	}
	th {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-faint);
		font-weight: 600;
	}
	tr:last-child td {
		border-bottom: none;
	}

	.roster-list {
		margin: 0.35rem 0 1rem;
		padding-left: 1.1rem;
		font-size: 0.88rem;
		line-height: 1.6;
	}

	.override-form {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		gap: 1rem;
		align-items: end;
	}
	.override-form select,
	.override-form textarea {
		background: var(--bg-raised-2);
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
		color: var(--text);
		font: inherit;
		padding: 0.7rem 0.9rem;
		min-height: 46px;
	}
	.override-form textarea {
		grid-column: 1 / -1;
		min-height: 5rem;
		resize: vertical;
	}
</style>
