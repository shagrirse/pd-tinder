<script lang="ts">
	let { user }: { user: { name: string; email: string; role: 'admin' | 'reviewer' } } = $props();
</script>

<header class="app-header">
	<a class="wordmark" href={user.role === 'admin' ? '/results' : '/review'}>
		<span class="dot"></span>pd<span class="slash">/</span>tinder
	</a>

	<nav class="app-nav">
		{#if user.role === 'reviewer'}
			<a href="/review">Deck</a>
			<a href="/review/reviewed">Reviewed</a>
		{:else}
			<a href="/results">Results</a>
			<a href="/admin/people">People</a>
			<a href="/admin/import">Import</a>
		{/if}
	</nav>

	<div class="app-user">
		<span class="user-name">{user.name}</span>
		<form method="POST" action="/logout">
			<button type="submit" class="signout">Sign out</button>
		</form>
	</div>
</header>

<style>
	.app-header {
		position: relative;
		z-index: 3;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.8rem 1.25rem;
		border-bottom: 1px solid var(--line);
		background: var(--bg-raised);
	}
	.wordmark {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-family: var(--font-display);
		font-weight: 800;
		font-style: italic;
		font-size: 1.05rem;
		color: var(--text);
		text-decoration: none;
		letter-spacing: -0.01em;
	}
	.dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 999px;
		background: var(--flame);
		box-shadow: 0 0 0 3px var(--flame-soft);
	}
	.slash {
		color: var(--flame);
	}
	.app-nav {
		display: flex;
		gap: 1.25rem;
	}
	.app-nav a {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-dim);
		text-decoration: none;
	}
	.app-nav a:hover {
		color: var(--text);
	}
	.app-user {
		display: flex;
		align-items: center;
		gap: 0.85rem;
	}
	.user-name {
		font-size: 0.82rem;
		color: var(--text-dim);
		display: none;
	}
	.signout {
		background: none;
		border: 1px solid var(--line-strong);
		color: var(--text-dim);
		font: inherit;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.4rem 0.7rem;
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.signout:hover {
		color: var(--danger);
		border-color: var(--danger);
	}
	@media (min-width: 30rem) {
		.user-name {
			display: inline;
		}
	}
</style>
