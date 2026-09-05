<script lang="ts">
	import '../app.css';
	import AppHeader from '$lib/components/AppHeader.svelte';

	let { data, children } = $props();
</script>

{#if data.user}
	<AppHeader user={data.user} />
{/if}

{@render children()}
