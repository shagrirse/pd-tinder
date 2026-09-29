<script lang="ts">
	import { enhance } from '$app/forms';
	import { createPendingSubmit } from '$lib/actions/pendingSubmit.svelte';
	import { displacementWarning, METHOD_LABEL, type MemberRow } from '$lib/members/rows';

	let {
		member,
		rows,
		lockedReason,
		onopen
	}: {
		member: MemberRow;
		rows: MemberRow[];
		/** Why pairing is unavailable, or null once a baseline exists. */
		lockedReason: string | null;
		onopen: (memberId: number) => void;
	} = $props();

	let pairing = $state(false);
	let partnerId = $state('');
	let reason = $state('');
	let error = $state<string | null>(null);

	let candidates = $derived(rows.filter((m) => m.role !== member.role));
	let partner = $derived(candidates.find((m) => String(m.id) === partnerId) ?? null);
	let warning = $derived(partner ? displacementWarning(member, partner) : null);
	let mentorId = $derived(member.role === 'mentor' ? member.id : (partner?.id ?? ''));
	let menteeId = $derived(member.role === 'mentee' ? member.id : (partner?.id ?? ''));
	let baselineDiffers = $derived(
		lockedReason === null &&
			(member.baselinePair?.memberId ?? null) !== (member.pair?.memberId ?? null)
	);

	const save = createPendingSubmit({
		onFailure: (data) => {
			error =
				typeof data?.overrideError === 'string' ? data.overrideError : 'Could not save the pair.';
		},
		onSuccess: () => {
			error = null;
			pairing = false;
			partnerId = '';
			reason = '';
		},
		reset: false
	});
</script>

<div class="block">
	<h3>Pairing</h3>

	<div class="row">
		<span class="label">Submitted</span>
		<span>{member.submitted ? 'Yes' : 'No'}</span>
	</div>

	<div class="row">
		<span class="label">Paired with</span>
		{#if member.pair}
			<span class="value">
				<button type="button" class="member-link" onclick={() => onopen(member.pair!.memberId)}>
					{member.pair.name}
				</button>
				<span class="chip">{METHOD_LABEL[member.pair.method]}</span>
			</span>
		{:else}
			<span class="missing">Unpaired</span>
		{/if}
	</div>
	{#if member.pair?.overrideReason}
		<p class="note">Override reason: {member.pair.overrideReason}</p>
	{/if}

	{#if baselineDiffers}
		<div class="row">
			<span class="label">Baseline pair</span>
			{#if member.baselinePair}
				<span>{member.baselinePair.name} · {METHOD_LABEL[member.baselinePair.method]}</span>
			{:else}
				<span class="missing">Unpaired in the baseline</span>
			{/if}
		</div>
	{/if}

	<p class="label choices-label">
		Their choices{#if !member.choicesFromBaseline && member.choices.length > 0}
			(not final until the form closes){/if}
	</p>
	{#if member.choices.length === 0}
		<p class="missing">No submission.</p>
	{:else}
		<ol class="choices">
			{#each member.choices as choice (choice.rank)}
				<li><strong>{choice.name}</strong> · {choice.reason}</li>
			{/each}
		</ol>
	{/if}

	{#if lockedReason !== null}
		<button type="button" class="btn btn-ghost" disabled aria-describedby="pair-locked-{member.id}">
			Pair with…
		</button>
		<p class="note" id="pair-locked-{member.id}">{lockedReason}</p>
	{:else if !pairing}
		<button type="button" class="btn btn-ghost" onclick={() => (pairing = true)}>Pair with…</button>
	{:else}
		<form method="POST" action="?/override" class="pair-form" use:enhance={save.submit}>
			<input type="hidden" name="mentorMemberId" value={mentorId} />
			<input type="hidden" name="menteeMemberId" value={menteeId} />
			<label class="field">
				<span class="field-label">Pair with</span>
				<select bind:value={partnerId} required>
					<option value="">Choose a {member.role === 'mentor' ? 'mentee' : 'mentor'}</option>
					{#each candidates as candidate (candidate.id)}
						<option value={String(candidate.id)}>
							{candidate.fullName}{candidate.pair && candidate.pair.memberId !== member.id
								? ` — paired with ${candidate.pair.name}`
								: ''}
						</option>
					{/each}
				</select>
			</label>
			{#if warning}<p class="warn-inline" role="status">{warning}</p>{/if}
			<label class="field">
				<span class="field-label">Reason</span>
				<textarea name="reason" bind:value={reason} required></textarea>
			</label>
			{#if error}<p class="form-error" role="alert">{error}</p>{/if}
			<div class="pair-actions">
				<button type="submit" class="btn btn-primary" disabled={save.pending || !partner}>
					{save.pending ? 'Saving…' : 'Save pair'}
				</button>
				<button
					type="button"
					class="btn btn-ghost"
					onclick={() => {
						pairing = false;
						error = null;
					}}
				>
					Cancel
				</button>
			</div>
		</form>
	{/if}
</div>

<style>
	.block {
		margin-top: 1.75rem;
	}
	.block h3 {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-faint);
		margin: 0 0 0.75rem;
		padding-bottom: 0.4rem;
		border-bottom: 1px solid var(--line);
	}
	.row {
		display: grid;
		grid-template-columns: 6.5rem minmax(0, 1fr);
		align-items: center;
		gap: 0.5rem 0.75rem;
		padding: 0.3rem 0;
	}
	.label {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-faint);
	}
	.value {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.choices-label {
		margin: 1rem 0 0.4rem;
	}
	.choices {
		margin: 0 0 1rem;
		padding-left: 1.2rem;
		font-size: 0.88rem;
		line-height: 1.6;
	}
	.missing {
		color: var(--text-faint);
		font-style: italic;
	}
	.note {
		color: var(--text-dim);
		font-size: 0.85rem;
		margin: 0.4rem 0 0.8rem;
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
	.pair-form {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}
	.pair-form select,
	.pair-form textarea {
		background: var(--bg-raised-2);
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
		color: var(--text);
		font: inherit;
		padding: 0.7rem 0.9rem;
		min-height: 46px;
	}
	.pair-form textarea {
		min-height: 5rem;
		resize: vertical;
	}
	.pair-actions {
		display: flex;
		gap: 0.6rem;
	}
	.warn-inline {
		margin: 0;
		font-size: 0.85rem;
		color: var(--meh);
	}
	.form-error {
		background: var(--danger-soft);
		color: var(--danger-text);
		border: 1px solid var(--danger);
		border-radius: var(--radius-sm);
		padding: 0.7rem 0.9rem;
		margin: 0;
	}
</style>
