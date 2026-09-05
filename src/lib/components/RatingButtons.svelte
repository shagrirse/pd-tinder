<script lang="ts">
	import type { RatingValue } from '$lib/draft';
	import VerdictIcon from './VerdictIcon.svelte';

	let { value = null, onchange, label }: {
		value: RatingValue | null;
		onchange: (v: RatingValue) => void;
		label: string;
	} = $props();

	const options: { value: RatingValue; text: string }[] = [
		{ value: 'skip', text: 'Weak' },
		{ value: 'meh', text: 'Meh' },
		{ value: 'like', text: 'Good' }
	];
</script>

<div class="ratings" role="group" aria-label={label}>
	{#each options as option (option.value)}
		<button
			type="button"
			class="rating rating-{option.value}"
			class:selected={value === option.value}
			aria-pressed={value === option.value}
			onclick={() => onchange(option.value)}
		>
			<VerdictIcon kind={option.value} />
			<span>{option.text}</span>
		</button>
	{/each}
</div>

<style>
	.ratings {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.5rem;
		margin-top: 0.85rem;
	}
	.rating {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		min-height: 42px;
		border: 1.5px solid var(--line-on-paper);
		border-radius: var(--radius-sm);
		background: var(--paper);
		color: var(--ink-on-paper-soft);
		font: inherit;
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		transition:
			border-color 120ms ease,
			color 120ms ease,
			background 120ms ease;
	}
	.rating:active {
		transform: scale(0.95);
	}
	.rating-like.selected {
		background: var(--like-soft);
		border-color: var(--like);
		color: var(--like);
	}
	.rating-meh.selected {
		background: var(--meh-soft);
		border-color: var(--meh);
		color: var(--meh);
	}
	.rating-skip.selected {
		background: var(--skip-soft);
		border-color: var(--skip);
		color: var(--skip);
	}
	.rating.selected {
		animation: stamp-pop 300ms cubic-bezier(0.2, 1.5, 0.4, 1);
	}
	@keyframes stamp-pop {
		0% {
			transform: scale(1.35) rotate(-6deg);
		}
		60% {
			transform: scale(0.96) rotate(2deg);
		}
		100% {
			transform: scale(1) rotate(0);
		}
	}
</style>
