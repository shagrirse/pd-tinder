<script lang="ts">
	import { trapFocus } from '$lib/actions/trapFocus';

	let {
		open,
		title,
		body,
		confirmLabel,
		danger = false,
		onconfirm,
		oncancel
	}: {
		open: boolean;
		title: string;
		body: string;
		confirmLabel: string;
		danger?: boolean;
		onconfirm: () => void;
		oncancel: () => void;
	} = $props();

	let dialogEl = $state<HTMLDivElement | undefined>();

	$effect(() => {
		if (open && dialogEl) dialogEl.focus();
	});
</script>

{#if open}
	<div
		class="backdrop"
		role="presentation"
		onclick={(event) => event.target === event.currentTarget && oncancel()}
		onkeydown={(event) => event.key === 'Escape' && oncancel()}
	>
		<div
			class="modal"
			role="dialog"
			aria-modal="true"
			aria-label={title}
			tabindex="-1"
			bind:this={dialogEl}
			use:trapFocus
		>
			<h2>{title}</h2>
			<p>{body}</p>
			<div class="actions">
				<button type="button" class="btn btn-ghost" onclick={oncancel}>Cancel</button>
				<button
					type="button"
					class={danger ? 'btn btn-danger' : 'btn btn-primary'}
					onclick={onconfirm}
				>
					{confirmLabel}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
		background: rgba(5, 10, 15, 0.72);
		backdrop-filter: blur(3px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.5rem;
	}
	.modal {
		width: 100%;
		max-width: 24rem;
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		box-shadow: 0 30px 80px rgba(0, 0, 0, 0.55);
	}
	.modal h2 {
		font-size: 1.3rem;
		margin: 0 0 0.6rem;
	}
	.modal p {
		color: var(--text-dim);
		font-size: 0.9rem;
		line-height: 1.55;
		margin: 0;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.6rem;
		margin-top: 1.5rem;
	}
</style>
