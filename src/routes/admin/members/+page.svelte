<script lang="ts">
	import MemberDetailModal from '$lib/components/MemberDetailModal.svelte';
	import MembersTable from '$lib/components/MembersTable.svelte';

	let { data } = $props();

	let detailMemberId = $state<number | null>(null);
	let detailMember = $derived(data.rows.find((m) => m.id === detailMemberId) ?? null);
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
	{:else if data.rows.length === 0}
		<p class="notice">No members in this cycle yet. Import a roster first.</p>
	{:else}
		<div class="panel">
			<MembersTable rows={data.rows} onopen={(id) => (detailMemberId = id)} />
		</div>
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
	.panel {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		padding: 1rem 1.1rem;
		margin-bottom: 1.25rem;
	}
</style>
