<script lang="ts">
	import { enhance } from '$app/forms';
	import { createPendingSubmit } from '$lib/actions/pendingSubmit.svelte';

	type Person = {
		id: number;
		name: string;
		active: boolean;
		inviteState: { kind: 'active' | 'invited' | 'needs-invite' };
	};

	let { person, isCurrentUser }: { person: Person; isCurrentUser: boolean } = $props();

	const invite = createPendingSubmit();
	const active = createPendingSubmit();
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
		<form method="POST" action="?/setActive" use:enhance={active.submit}>
			<input type="hidden" name="userId" value={person.id} />
			<input type="hidden" name="active" value={person.active ? 'false' : 'true'} />
			<button type="submit" class="link-btn" class:danger={person.active} disabled={active.pending}>
				{active.pending ? 'Saving…' : person.active ? 'Deactivate' : 'Reactivate'}
			</button>
		</form>
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
