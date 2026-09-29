<script lang="ts">
	import { enhance } from '$app/forms';
	import { createPendingSubmit } from '$lib/actions/pendingSubmit.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import MemberDetailModal from '$lib/components/MemberDetailModal.svelte';

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

	let totalRoster = $derived(
		data.submissions.submitted.length + data.submissions.notSubmitted.length
	);

	let detailMemberId = $state<number | null>(null);

	const reopen = createPendingSubmit();
	const close = createPendingSubmit();
	const reconcile = createPendingSubmit();
	const override = createPendingSubmit();
	let closeFormEl: HTMLFormElement | undefined = $state();
	let closeConfirmOpen = $state(false);

	let pairedMentorIds = $derived(new Set(data.pairings.map((p) => p.mentor.id)));
	let pairedMenteeIds = $derived(new Set(data.pairings.map((p) => p.mentee.id)));
	// Every list on this page already knows each member's role.
	let detailMember = $derived.by(() => {
		if (detailMemberId === null || !data.cycle) return null;
		const all = [
			...data.submissions.notSubmitted,
			...data.residual.unpaired,
			...data.residual.gotNoChoice,
			...data.pairings.flatMap((p) => [p.mentor, p.mentee])
		];
		const found = all.find((m) => m.id === detailMemberId);
		if (!found) return null;
		// Pairing table rows carry the role inside the pair; every other list
		// row already has `role` on it. The cast is safe: the runtime `in`
		// check guards the pairing rows, and the union's other members collapse
		// structurally into RosterRow.
		const role: 'mentor' | 'mentee' =
			'role' in found
				? (found.role as 'mentor' | 'mentee')
				: data.pairings.some((p) => p.mentor.id === found.id)
					? 'mentor'
					: 'mentee';
		return { ...found, role };
	});
</script>

<section class="wrap">
	<header class="page-head">
		<p class="eyebrow">Admin</p>
		<h1>
			Pairing{#if data.cycle}<span class="cycle-name"> · {data.cycle.name}</span>{/if}
		</h1>
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
			{#if data.baseline}
				<p class="done-body">
					Baseline saved {new Date(data.baseline.createdAt).toLocaleString()}.
				</p>
			{/if}

			{#if data.submissions.notSubmitted.length > 0}
				<p class="field-label">Not submitted</p>
				<ul class="roster-list">
					{#each data.submissions.notSubmitted as member (member.id)}
						<li>
							<button class="member-link" onclick={() => (detailMemberId = member.id)}>
								{member.fullName}
							</button>
							({member.role})
						</li>
					{/each}
				</ul>
			{/if}

			{#if data.status === 'closed'}
				<form method="POST" action="?/reopen" class="inline-form" use:enhance={reopen.submit}>
					<button type="submit" class="btn btn-primary" disabled={reopen.pending}>
						{reopen.pending ? 'Reopening…' : 'Reopen form'}
					</button>
				</form>
			{:else if data.status === 'open'}
				<form
					method="POST"
					action="?/close"
					class="inline-form"
					use:enhance={close.submit}
					bind:this={closeFormEl}
				>
					<button
						type="button"
						class="btn btn-danger"
						disabled={close.pending}
						onclick={() => (closeConfirmOpen = true)}
					>
						{close.pending ? 'Closing…' : 'Close form'}
					</button>
				</form>
			{/if}
		</div>

		<div class="panel">
			<div class="panel-head"><span>Reconciliation</span></div>
			{#if data.status === 'closed'}
				<p class="done-body">
					The form is closed, so these pairs are the saved baseline plus any overrides. Reopen the
					form to rerun reconciliation.
				</p>
			{:else}
				<form method="POST" action="?/reconcile" class="inline-form" use:enhance={reconcile.submit}>
					<button type="submit" class="btn btn-primary" disabled={reconcile.pending}>
						{reconcile.pending ? 'Running…' : 'Run reconciliation'}
					</button>
				</form>
				<p class="warn-inline">
					Rebuilds pairings from current submissions. Manual overrides are preserved; every other
					pairing is recomputed.
				</p>
			{/if}

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
									<td>
										<button class="member-link" onclick={() => (detailMemberId = pair.mentor.id)}>
											{pair.mentor.fullName}
										</button>
									</td>
									<td>
										<button class="member-link" onclick={() => (detailMemberId = pair.mentee.id)}>
											{pair.mentee.fullName}
										</button>
									</td>
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
						<li>
							<button class="member-link" onclick={() => (detailMemberId = member.id)}>
								{member.fullName}
							</button>
							({member.role})
						</li>
					{/each}
				</ul>
			{/if}

			<p class="field-label">Got none of their choices</p>
			{#if data.residual.gotNoChoice.length === 0}
				<p class="notice">Nobody.</p>
			{:else}
				<ul class="roster-list">
					{#each data.residual.gotNoChoice as member (member.id)}
						<li>
							<button class="member-link" onclick={() => (detailMemberId = member.id)}>
								{member.fullName}
							</button>
							({member.role})
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<div class="panel">
			<div class="panel-head"><span>Override a pair</span></div>
			{#if !data.baseline}
				<p class="notice">
					Close the preference form first. Overrides are measured against the baseline it saves.
				</p>
			{/if}
			<form method="POST" action="?/override" class="override-form" use:enhance={override.submit}>
				<div class="override-pair">
					<label class="field">
						<span class="field-label">Mentor</span>
						<select name="mentorMemberId" required>
							<option value="">Choose a mentor</option>
							{#each data.mentors as mentor (mentor.id)}
								<option value={mentor.id}>
									{mentor.fullName}{pairedMentorIds.has(mentor.id) ? ' — already paired' : ''}
								</option>
							{/each}
						</select>
					</label>
					<label class="field">
						<span class="field-label">Mentee</span>
						<select name="menteeMemberId" required>
							<option value="">Choose a mentee</option>
							{#each data.mentees as mentee (mentee.id)}
								<option value={mentee.id}>
									{mentee.fullName}{pairedMenteeIds.has(mentee.id) ? ' — already paired' : ''}
								</option>
							{/each}
						</select>
					</label>
				</div>
				<label class="field">
					<span class="field-label">Reason</span>
					<textarea name="reason"></textarea>
				</label>
				<button type="submit" class="btn btn-primary" disabled={override.pending || !data.baseline}>
					{override.pending ? 'Saving…' : 'Save override'}
				</button>
			</form>
		</div>

		<div class="panel">
			<div class="panel-head"><span>Export</span></div>
			<div class="export-links">
				<a href="/admin/pairing/export" class="btn btn-ghost">Export pairings CSV</a>
				{#if data.baseline}
					<a href="/admin/pairing/export/baseline" class="btn btn-ghost">Export baseline CSV</a>
					<a href="/admin/pairing/export/overrides" class="btn btn-ghost">Export overrides CSV</a>
				{/if}
			</div>
		</div>
	{/if}

	<MemberDetailModal
		member={detailMember}
		actionUrl="?/updateMember"
		onclose={() => (detailMemberId = null)}
	/>

	<ConfirmDialog
		open={closeConfirmOpen}
		title="Close the preference form?"
		body="Members who haven't submitted yet will no longer be able to. Closing also saves the baseline: everyone's choices and the pairs they produce. You can reopen it later."
		confirmLabel="Close form"
		danger
		onconfirm={() => {
			closeConfirmOpen = false;
			closeFormEl?.requestSubmit();
		}}
		oncancel={() => (closeConfirmOpen = false)}
	/>
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
		font-size: 2.1rem;
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
	.warn-inline {
		margin: 0.9rem 0 0;
		font-size: 0.85rem;
		color: var(--meh);
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
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.override-pair {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
		gap: 1rem;
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
		min-height: 5rem;
		resize: vertical;
	}
	.override-form .btn {
		align-self: flex-start;
	}
	.export-links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}
	.member-link {
		background: none;
		border: none;
		padding: 0.4rem 0;
		display: inline-block;
		color: var(--text);
		font: inherit;
		text-decoration: underline;
		text-underline-offset: 2px;
		cursor: pointer;
	}
	.member-link:hover {
		color: var(--flame);
	}
</style>
