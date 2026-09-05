<script lang="ts">
	let { data } = $props();
</script>

<section class="wrap">
	<header class="page-head">
		<p class="eyebrow">Your history</p>
		<h1>What you reviewed</h1>
		<a class="back-link" href="/review">&larr; Back to the deck</a>
	</header>

	{#if data.items.length === 0}
		<p class="empty-note">You have not submitted any reviews yet.</p>
	{:else}
		<ul class="review-list">
			{#each data.items as item (item.applicantId)}
				<li>
					<a class="review-row" href="/review?applicant={item.applicantId}">
						<span class="ref mono">#{item.publicRef}</span>
						<span class="row-main">
							<span class="row-industry">{item.industry1}</span>
							<span class="row-meta mono">rated {item.ratedCount}/8</span>
						</span>
						{#if item.redFlag}
							<span class="verdict-tag verdict-flag">Red flag</span>
						{:else}
							<span class="verdict-tag verdict-{item.overall}">{item.overall}</span>
						{/if}
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.wrap {
		max-width: 34rem;
		margin: 0 auto;
		padding: 2rem 1.25rem 4rem;
	}
	.page-head {
		margin-bottom: 1.5rem;
	}
	h1 {
		font-size: 1.75rem;
		margin: 0 0 0.6rem;
	}
	.back-link {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-dim);
		text-decoration: none;
	}
	.back-link:hover {
		color: var(--flame);
	}
	.empty-note {
		color: var(--text-dim);
	}

	.review-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.review-row {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		padding: 0.8rem 1rem;
		text-decoration: none;
		color: var(--text);
		transition:
			border-color 140ms ease,
			transform 140ms ease;
	}
	.review-row:hover {
		border-color: var(--line-strong);
		transform: translateX(2px);
	}
	.ref {
		color: var(--text-dim);
		font-size: 0.85rem;
		min-width: 2.6rem;
	}
	.mono {
		font-family: var(--font-mono);
	}
	.row-main {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.row-industry {
		font-weight: 600;
		font-size: 0.92rem;
	}
	.row-meta {
		color: var(--text-faint);
		font-size: 0.72rem;
	}
</style>
