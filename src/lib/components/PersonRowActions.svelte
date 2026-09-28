<script lang="ts">
	import { enhance } from '$app/forms';
	import { createPendingSubmit } from '$lib/actions/pendingSubmit.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';

	type Person = {
		id: number;
		name: string;
		active: boolean;
		inviteState: { kind: 'active' | 'invited' | 'needs-invite' };
	};

	let { person, isCurrentUser }: { person: Person; isCurrentUser: boolean } = $props();

	const invite = createPendingSubmit();
	const active = createPendingSubmit();

	let confirmOpen = $state(false);
	let activeFormEl: HTMLFormElement | undefined = $state();
</script>

<td class="row-actions">
	{#if person.inviteState.kind !== 'active'}
		<form method="POST" action="?/regenerate" use:enhance={invite.submit}>
			<input type="hidden" name="userId" value={person.id} />
			<input type="hidden" name="personName" value={person.name} />
			<button type="submit" class="link-btn" disabled={invite.pending}>
				{invite.pending ? 'Sending…' : 'New invite'}
			</button>
		</form>
	{/if}
	{#if !isCurrentUser}
		<form method="POST" action="?/setActive" use:enhance={active.submit} bind:this={activeFormEl}>
			<input type="hidden" name="userId" value={person.id} />
			<input type="hidden" name="active" value={person.active ? 'false' : 'true'} />
			{#if person.active}
				<button
					type="button"
					class="link-btn danger"
					disabled={active.pending}
					onclick={() => (confirmOpen = true)}
				>
					{active.pending ? 'Saving…' : 'Deactivate'}
				</button>
			{:else}
				<button type="submit" class="link-btn" disabled={active.pending}>
					{active.pending ? 'Saving…' : 'Reactivate'}
				</button>
			{/if}
		</form>

		<ConfirmDialog
			open={confirmOpen}
			title="Deactivate {person.name}?"
			body="They'll lose access immediately. You can reactivate them later."
			confirmLabel="Deactivate"
			danger
			onconfirm={() => {
				confirmOpen = false;
				activeFormEl?.requestSubmit();
			}}
			oncancel={() => (confirmOpen = false)}
		/>
	{/if}
</td>

<style>
	.row-actions {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		align-items: flex-start;
	}
	.link-btn {
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		font-size: 0.82rem;
		color: var(--flame);
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 2px;
		white-space: nowrap;
	}
	.link-btn:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.link-btn.danger {
		color: var(--danger-text);
	}
</style>
