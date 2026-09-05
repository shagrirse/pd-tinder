<script lang="ts">
	let { kind }: { kind: 'like' | 'meh' | 'skip' } = $props();
</script>

{#if kind === 'like'}
	<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
		<path
			d="M12 20.3s-7.7-4.6-10.1-9.3C.5 7.7 2.3 4.2 6 3.8c2-.2 3.7.9 4.7 2.5.15.25.5.25.65 0 1-1.6 2.7-2.7 4.7-2.5 3.7.4 5.5 3.9 4.1 7.2-2.4 4.7-10.15 9.3-10.15 9.3z"
			fill="currentColor"
		/>
	</svg>
{:else if kind === 'meh'}
	<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
		<circle cx="12" cy="12" r="9.1" fill="none" stroke="currentColor" stroke-width="1.8" />
		<line x1="7.7" y1="14.6" x2="16.3" y2="14.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
		<circle cx="8.6" cy="9.6" r="1.05" fill="currentColor" />
		<circle cx="15.4" cy="9.6" r="1.05" fill="currentColor" />
	</svg>
{:else}
	<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
		<path
			d="M6 6l12 12M18 6L6 18"
			fill="none"
			stroke="currentColor"
			stroke-width="2.4"
			stroke-linecap="round"
		/>
	</svg>
{/if}
