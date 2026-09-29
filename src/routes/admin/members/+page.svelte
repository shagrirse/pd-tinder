<script lang="ts">
	import { enhance } from '$app/forms';
	import { createPendingSubmit } from '$lib/actions/pendingSubmit.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import MemberDetailModal from '$lib/components/MemberDetailModal.svelte';
	import MembersTable from '$lib/components/MembersTable.svelte';

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

	let detailMemberId = $state<number | null>(null);
	let detailMember = $derived(data.rows.find((m) => m.id === detailMemberId) ?? null);

	let submittedCount = $derived(data.rows.filter((m) => m.submitted).length);
	// The same UTC format as the CSV exports, so the server's locale and time
	// zone never leak into what an admin reads.
	let baselineSavedAt = $derived(
		data.baseline
			? new Date(data.baseline.createdAt).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
			: ''
	);
	// A cycle can be closed without a baseline: closed before baselines existed,
	// or the member links expired on their own.
	let closedWithoutBaseline = $derived(data.status === 'closed' && !data.baseline);

	// Interim override panel: replaced by "Pair with…" in the member modal.
	let mentors = $derived(data.rows.filter((m) => m.role === 'mentor'));
	let mentees = $derived(data.rows.filter((m) => m.role === 'mentee'));

	const reopen = createPendingSubmit();
	const close = createPendingSubmit();
	const reconcile = createPendingSubmit();
	const override = createPendingSubmit();
	let closeFormEl: HTMLFormElement | undefined = $state();
	let closeConfirmOpen = $state(false);
	let tokensFormEl: HTMLFormElement | undefined = $state();
	let regenConfirmOpen = $state(false);
</script>

<section class="wrap">
	<header class="page-head">
		<p class="eyebrow">Admin</p>
		<h1>
			Members{#if data.cycle}<span class="cycle-name"> · {data.cycle.name}</span>{/if}
		</h1>
	</header>

	{#if !data.cycle}
		<p class="notice">No active cycle. Open one before running the pairing round.</p>
	{:else}
		{#if form?.error}<p class="form-error" role="alert">{form.error}</p>{/if}

		<div class="strip">
			<div class="panel">
				<div class="panel-head">
					<span>Preference form</span>
					<span class="verdict-tag {STATUS_TAG[data.status]}">{STATUS_LABEL[data.status]}</span>
				</div>
				<p class="done-body">{submittedCount} of {data.rows.length} submitted.</p>
				{#if data.baseline}
					<p class="done-body">Baseline saved {baselineSavedAt}.</p>
				{/if}

				<div class="card-actions">
					{#if data.status === 'closed'}
						<form method="POST" action="?/reopen" use:enhance={reopen.submit}>
							<button type="submit" class="btn btn-primary" disabled={reopen.pending}>
								{reopen.pending ? 'Reopening…' : 'Reopen form'}
							</button>
						</form>
					{:else if data.status === 'open'}
						<form method="POST" action="?/close" use:enhance={close.submit} bind:this={closeFormEl}>
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
					<!-- Generating links is what opens the form. A plain POST, not
					     enhanced, so the browser receives the CSV download. -->
					<form method="POST" action="/admin/roster/tokens" bind:this={tokensFormEl}>
						<input type="hidden" name="cycleId" value={data.cycle.id} />
						{#if data.status === 'not_opened'}
							<button type="submit" class="btn btn-primary">Generate &amp; export links</button>
						{:else if data.status === 'open'}
							<button type="button" class="btn btn-ghost" onclick={() => (regenConfirmOpen = true)}>
								Regenerate links
							</button>
						{/if}
					</form>
				</div>
			</div>

			<div class="panel">
				<div class="panel-head"><span>Reconciliation</span></div>
				{#if closedWithoutBaseline}
					<p class="done-body">
						No baseline was saved for this close. Reopen the form and close it again to save one.
					</p>
				{:else if data.status === 'closed'}
					<p class="done-body">
						The form is closed, so these pairs are the saved baseline plus any overrides. Reopen the
						form to rerun reconciliation.
					</p>
				{:else}
					<form method="POST" action="?/reconcile" use:enhance={reconcile.submit}>
						<button type="submit" class="btn btn-primary" disabled={reconcile.pending}>
							{reconcile.pending ? 'Running…' : 'Run reconciliation'}
						</button>
					</form>
					<p class="warn-inline">
						Rebuilds pairings from current submissions. Manual overrides are preserved; every other
						pairing is recomputed.
					</p>
				{/if}
			</div>

			<div class="panel">
				<div class="panel-head"><span>Exports</span></div>
				<div class="export-links">
					<a href="/admin/members/export/pairings" class="btn btn-ghost">Export pairings CSV</a>
					{#if data.baseline}
						<a href="/admin/members/export/baseline" class="btn btn-ghost">Export baseline CSV</a>
						<a href="/admin/members/export/overrides" class="btn btn-ghost">Export overrides CSV</a>
					{:else}
						<button type="button" class="btn btn-ghost" disabled>Export baseline CSV</button>
						<button type="button" class="btn btn-ghost" disabled>Export overrides CSV</button>
					{/if}
				</div>
			</div>
		</div>

		{#if data.rows.length === 0}
			<p class="notice">No members in this cycle yet. Import a roster first.</p>
		{:else}
			<div class="panel">
				<MembersTable rows={data.rows} onopen={(id) => (detailMemberId = id)} />
			</div>
		{/if}

		<div class="panel">
			<div class="panel-head"><span>Override a pair</span></div>
			{#if closedWithoutBaseline}
				<p class="notice">
					No baseline was saved for this close. Reopen the form and close it again to save one.
				</p>
			{:else if !data.baseline}
				<p class="notice">
					Close the preference form first. Overrides are measured against the baseline it saves.
				</p>
			{/if}
			<form method="POST" action="?/override" class="override-form" use:enhance={override.submit}>
				<div class="override-pair">
					<label class="field">
						<span class="field-label">Mentor</span>
						<select name="mentorMemberId" aria-label="Mentor" required>
							<option value="">Choose a mentor</option>
							{#each mentors as mentor (mentor.id)}
								<option value={mentor.id}>
									{mentor.fullName}{mentor.pair ? ' — already paired' : ''}
								</option>
							{/each}
						</select>
					</label>
					<label class="field">
						<span class="field-label">Mentee</span>
						<select name="menteeMemberId" aria-label="Mentee" required>
							<option value="">Choose a mentee</option>
							{#each mentees as mentee (mentee.id)}
								<option value={mentee.id}>
									{mentee.fullName}{mentee.pair ? ' — already paired' : ''}
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

		<ConfirmDialog
			open={regenConfirmOpen}
			title="Regenerate member links?"
			body="Every existing member's link stops working immediately. Anyone who hasn't opened theirs yet will need the new one."
			confirmLabel="Regenerate links"
			danger
			onconfirm={() => {
				regenConfirmOpen = false;
				tokensFormEl?.requestSubmit();
			}}
			oncancel={() => (regenConfirmOpen = false)}
		/>
	{/if}

	<MemberDetailModal
		member={detailMember}
		actionUrl="?/updateMember"
		onclose={() => (detailMemberId = null)}
	/>
</section>

<style>
	.wrap {
		max-width: 72rem;
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
	.strip {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
		gap: 1rem;
		margin-bottom: 1.25rem;
	}
	.strip .panel {
		margin-bottom: 0;
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
	.card-actions,
	.export-links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}
	.warn-inline {
		margin: 0.9rem 0 0;
		font-size: 0.85rem;
		color: var(--meh);
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
</style>
