<script lang="ts">
	let { open = false, onconfirm, oncancel }: {
		open: boolean;
		onconfirm: (reason: string) => void;
		oncancel: () => void;
	} = $props();

	let reason = $state('');
	const MIN_LENGTH = 10;
	let tooShort = $derived(reason.trim().length < MIN_LENGTH);

	$effect(() => {
		if (!open) reason = '';
	});
</script>

{#if open}
	<div
		class="backdrop"
		role="presentation"
		onclick={(event) => event.target === event.currentTarget && oncancel()}
		onkeydown={(event) => event.key === 'Escape' && oncancel()}
	>
		<div class="sheet" role="dialog" aria-modal="true" aria-label="Raise a red flag" tabindex="-1">
			<div class="sheet-handle" aria-hidden="true"></div>
			<p class="eyebrow">Reject outright</p>
			<h2>Red flag this applicant</h2>
			<p class="hint">
				This overrides every rating. Say why — an admin will read this before anyone else does.
			</p>
			<textarea
				class="reason-field"
				bind:value={reason}
				rows="4"
				placeholder="What is disqualifying?"
			></textarea>
			<div class="actions">
				<button type="button" class="btn btn-ghost" onclick={oncancel}>Cancel</button>
				<button
					type="button"
					class="btn btn-danger"
					disabled={tooShort}
					onclick={() => onconfirm(reason.trim())}
				>
					Confirm red flag
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 20;
		background: rgba(10, 6, 5, 0.72);
		backdrop-filter: blur(3px);
		display: flex;
		align-items: flex-end;
		justify-content: center;
		animation: fade-in 200ms ease both;
	}
	.sheet {
		width: 100%;
		max-width: 30rem;
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-bottom: none;
		color: var(--text);
		padding: 0.75rem 1.4rem calc(env(safe-area-inset-bottom, 0px) + 1.5rem);
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		box-shadow: 0 -20px 60px rgba(0, 0, 0, 0.5);
		animation: sheet-up 320ms cubic-bezier(0.22, 0.85, 0.25, 1) both;
	}
	.sheet-handle {
		width: 2.5rem;
		height: 4px;
		border-radius: 999px;
		background: var(--line-strong);
		margin: 0 auto 1rem;
	}
	h2 {
		font-size: 1.4rem;
		margin: 0 0 0.5rem;
	}
	.hint {
		color: var(--text-dim);
		font-size: 0.88rem;
		margin: 0 0 1rem;
		line-height: 1.5;
	}
	.reason-field {
		width: 100%;
		box-sizing: border-box;
		resize: vertical;
		background: var(--bg-raised-2);
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
		color: var(--text);
		font: inherit;
		font-size: 0.9rem;
		padding: 0.7rem 0.8rem;
	}
	.reason-field:focus-visible {
		outline: none;
		border-color: var(--danger);
		box-shadow: 0 0 0 3px var(--danger-soft);
	}
	.reason-field::placeholder {
		color: var(--text-faint);
	}
	.actions {
		display: grid;
		grid-template-columns: 1fr 1.4fr;
		gap: 0.6rem;
		margin-top: 1rem;
	}
	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	@keyframes sheet-up {
		from {
			transform: translateY(100%);
		}
		to {
			transform: translateY(0);
		}
	}
</style>
