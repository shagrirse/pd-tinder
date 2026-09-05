<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<section class="auth-stage">
	<div class="auth-card">
		<a class="wordmark" href="/"><span class="dot"></span>pd<span class="slash">/</span>tinder</a>
		{@render children()}
	</div>
</section>

<style>
	.auth-stage {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.5rem;
	}
	.auth-card {
		width: 100%;
		max-width: 24rem;
		background: var(--paper);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-card);
		padding: 2.25rem 1.9rem 2rem;
		color: var(--ink-on-paper);
	}
	.wordmark {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-family: var(--font-display);
		font-weight: 800;
		font-style: italic;
		font-size: 1rem;
		color: var(--ink-on-paper);
		text-decoration: none;
		margin-bottom: 1.5rem;
	}
	.dot {
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 999px;
		background: var(--flame);
	}
	.slash {
		color: var(--flame);
	}
	:global(.auth-card h1) {
		font-family: var(--font-display);
		font-size: 1.75rem;
		margin: 0 0 0.35rem;
	}
	:global(.auth-card .hint) {
		color: var(--ink-on-paper-soft);
		font-size: 0.88rem;
		margin: 0 0 1.5rem;
	}
	:global(.auth-card .form-error) {
		background: var(--danger-soft);
		color: var(--danger);
		border: 1px solid var(--danger);
		border-radius: var(--radius-sm);
		padding: 0.6rem 0.8rem;
		font-size: 0.85rem;
		margin: 0 0 1.1rem;
	}
	:global(.auth-card .auth-form) {
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
	}
	:global(.auth-card .field-label) {
		color: var(--ink-on-paper-soft);
	}
	:global(.auth-card .field input) {
		background: var(--paper-dim);
		border-color: var(--line-on-paper);
		color: var(--ink-on-paper);
	}
	:global(.auth-card .field input:focus-visible) {
		outline: none;
		border-color: var(--flame);
		box-shadow: 0 0 0 3px var(--flame-soft);
	}
	:global(.auth-card .btn) {
		margin-top: 0.4rem;
	}
</style>
