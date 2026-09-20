<script lang="ts">
	let { data, form } = $props();

	const roleLabel = $derived(data.member.role === 'mentor' ? 'mentees' : 'mentors');

	let choice1 = $state(0);
	let choice2 = $state(0);
	let choice3 = $state(0);
	let reason1 = $state('');
	let reason2 = $state('');
	let reason3 = $state('');

	// A plain form POST always reloads the page, so this only ever runs once
	// per mount — but syncing from props via $effect (not $state(prop)) is
	// what keeps svelte-check quiet about `data`/`form` being read once.
	$effect(() => {
		const source = form?.choices ?? data.existing;
		choice1 = source.find((c) => c.rank === 1)?.choiceMemberId ?? 0;
		choice2 = source.find((c) => c.rank === 2)?.choiceMemberId ?? 0;
		choice3 = source.find((c) => c.rank === 3)?.choiceMemberId ?? 0;
		reason1 = source.find((c) => c.rank === 1)?.reason ?? '';
		reason2 = source.find((c) => c.rank === 2)?.reason ?? '';
		reason3 = source.find((c) => c.rank === 3)?.reason ?? '';
	});

	const groups = $derived.by(() => {
		const byIndustry = new Map<string, typeof data.roster>();
		for (const m of data.roster) {
			const key = m.industry ?? 'Other';
			if (!byIndustry.has(key)) byIndustry.set(key, []);
			byIndustry.get(key)!.push(m);
		}
		return [...byIndustry.entries()];
	});

	// Picking someone already chosen at another rank swaps the two ranks'
	// people. Options for an already-chosen person stay enabled (disabling
	// them would make a swap impossible to reach — there'd be no click that
	// could ever select a disabled option), so this covers the case a plain
	// "one person, one rank" constraint doesn't: reassigning, not just
	// blocking, a duplicate pick.
	function pick(rank: 1 | 2 | 3, newValue: number) {
		const old = rank === 1 ? choice1 : rank === 2 ? choice2 : choice3;
		if (newValue !== 0) {
			if (rank !== 1 && choice1 === newValue) choice1 = old;
			if (rank !== 2 && choice2 === newValue) choice2 = old;
			if (rank !== 3 && choice3 === newValue) choice3 = old;
		}
		if (rank === 1) choice1 = newValue;
		else if (rank === 2) choice2 = newValue;
		else choice3 = newValue;
	}

	const RANK_WORD = { 1: 'first', 2: 'second', 3: 'third' } as const;

	function otherRankFor(memberId: number, ownRank: 1 | 2 | 3): 1 | 2 | 3 | null {
		if (ownRank !== 1 && choice1 === memberId) return 1;
		if (ownRank !== 2 && choice2 === memberId) return 2;
		if (ownRank !== 3 && choice3 === memberId) return 3;
		return null;
	}

	function optionLabel(m: { fullName: string; id: number }, ownRank: 1 | 2 | 3): string {
		const other = otherRankFor(m.id, ownRank);
		return other ? `${m.fullName} (currently your ${RANK_WORD[other]} choice)` : m.fullName;
	}
</script>

<svelte:head>
	<title>pd/tinder — Rank your choices</title>
</svelte:head>

<section class="stage">
	<div class="sheet">
		<p class="eyebrow">Preference form</p>
		<h1>Rank your top three {roleLabel}</h1>
		<p class="hint">
			Welcome, {data.member.fullName}. Pick your first, second and third choice from the roster
			below, with a reason for each. You can come back and change your answers until the form
			closes.
		</p>

		{#if form?.error}<p class="form-error" role="alert">{form.error}</p>{/if}
		{#if form?.saved}<p class="form-success" role="status">Saved.</p>{/if}

		<form method="POST" class="ranks">
			<div class="rank-block">
				<div class="field">
					<label class="field-label" for="choice1">First choice</label>
					<select id="choice1" name="choice1" value={choice1} onchange={(e) => pick(1, Number(e.currentTarget.value))}>
						<option value={0} disabled>Choose one</option>
						{#each groups as [industry, people]}
							<optgroup label={industry}>
								{#each people as m}
									<option value={m.id}>{optionLabel(m, 1)}</option>
								{/each}
							</optgroup>
						{/each}
					</select>
				</div>
				<div class="field">
					<label class="field-label" for="reason1">First choice reason</label>
					<textarea id="reason1" name="reason1" rows="2" bind:value={reason1}></textarea>
				</div>
			</div>

			<div class="rank-block">
				<div class="field">
					<label class="field-label" for="choice2">Second choice</label>
					<select id="choice2" name="choice2" value={choice2} onchange={(e) => pick(2, Number(e.currentTarget.value))}>
						<option value={0} disabled>Choose one</option>
						{#each groups as [industry, people]}
							<optgroup label={industry}>
								{#each people as m}
									<option value={m.id}>{optionLabel(m, 2)}</option>
								{/each}
							</optgroup>
						{/each}
					</select>
				</div>
				<div class="field">
					<label class="field-label" for="reason2">Second choice reason</label>
					<textarea id="reason2" name="reason2" rows="2" bind:value={reason2}></textarea>
				</div>
			</div>

			<div class="rank-block">
				<div class="field">
					<label class="field-label" for="choice3">Third choice</label>
					<select id="choice3" name="choice3" value={choice3} onchange={(e) => pick(3, Number(e.currentTarget.value))}>
						<option value={0} disabled>Choose one</option>
						{#each groups as [industry, people]}
							<optgroup label={industry}>
								{#each people as m}
									<option value={m.id}>{optionLabel(m, 3)}</option>
								{/each}
							</optgroup>
						{/each}
					</select>
				</div>
				<div class="field">
					<label class="field-label" for="reason3">Third choice reason</label>
					<textarea id="reason3" name="reason3" rows="2" bind:value={reason3}></textarea>
				</div>
			</div>

			<button type="submit" class="btn btn-primary btn-block">Save my choices</button>
		</form>
	</div>
</section>

<style>
	.stage {
		min-height: 100vh;
		display: flex;
		justify-content: center;
		padding: 2.5rem 1.5rem;
	}
	.sheet {
		width: 100%;
		max-width: 40rem;
		background: var(--paper);
		color: var(--ink-on-paper);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-card);
		padding: 2.25rem 2rem;
	}
	.hint {
		color: var(--ink-on-paper-soft);
		font-size: 0.92rem;
	}
	.form-error {
		background: var(--danger-soft);
		color: var(--danger);
		border: 1px solid var(--danger);
		border-radius: var(--radius-sm);
		padding: 0.6rem 0.8rem;
		font-size: 0.85rem;
	}
	.form-success {
		background: var(--like-soft);
		color: var(--like);
		border: 1px solid var(--like);
		border-radius: var(--radius-sm);
		padding: 0.6rem 0.8rem;
		font-size: 0.85rem;
	}
	.ranks {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		margin-top: 1.5rem;
	}
	.rank-block {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding-bottom: 1.25rem;
		border-bottom: 1px solid var(--line-on-paper);
	}
	.rank-block :global(.field-label) {
		color: var(--ink-on-paper-soft);
	}
	.rank-block select,
	.rank-block textarea {
		background: var(--paper-dim);
		border: 1.5px solid var(--line-on-paper);
		border-radius: var(--radius-sm);
		color: var(--ink-on-paper);
		font: inherit;
		font-size: 1rem;
		padding: 0.7rem 0.85rem;
	}
	.rank-block select:focus-visible,
	.rank-block textarea:focus-visible {
		outline: none;
		border-color: var(--flame);
		box-shadow: 0 0 0 3px var(--flame-soft);
	}
</style>
