<script lang="ts">
	let { data, form } = $props();

	let copied = $state(false);

	async function copyInvite(link: string) {
		try {
			await navigator.clipboard.writeText(link);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			copied = false;
		}
	}

	function formatDate(value: Date | string): string {
		return new Date(value).toLocaleDateString();
	}
</script>

<section class="wrap">
	<header class="page-head">
		<p class="eyebrow">Admin</p>
		<h1>People{#if data.cycleName}<span class="cycle-name"> · {data.cycleName}</span>{/if}</h1>
	</header>

	{#if form?.inviteUrl}
		{@const inviteUrl = form.inviteUrl}
		<div class="invite-panel">
			<p class="invite-title">Invite link for {form.personName}</p>
			<p class="invite-warning">
				This is shown once. Copy it now — only its hash is stored, so it cannot be retrieved later.
				If you lose it, issue a new one from the roster.
			</p>
			<div class="invite-row">
				<code>{inviteUrl}</code>
				<button type="button" class="btn btn-primary" onclick={() => copyInvite(inviteUrl)}>
					{copied ? 'Copied' : 'Copy'}
				</button>
			</div>
		</div>
	{/if}

	{#if form?.error}<p class="form-error" role="alert">{form.error}</p>{/if}

	{#if !data.cycleName}
		<p class="notice">
			No recruitment cycle is open. People can be listed, but adding one needs an open cycle because
			industry assignments belong to a cycle.
		</p>
	{/if}

	<div class="panel">
		<div class="panel-head"><span>Add someone</span></div>
		<form method="POST" action="?/create" class="create-form">
			<label class="field">
				<span class="field-label">Name</span>
				<input name="name" required disabled={!data.cycleName} />
			</label>
			<label class="field">
				<span class="field-label">Email</span>
				<input name="email" type="email" required disabled={!data.cycleName} />
			</label>
			<label class="field">
				<span class="field-label">Role</span>
				<select name="role" disabled={!data.cycleName}>
					<option value="reviewer">Reviewer</option>
					<option value="admin">Admin</option>
				</select>
			</label>

			<fieldset class="industries" disabled={!data.cycleName}>
				<legend class="field-label">Industries</legend>
				{#each data.industries as industry (industry)}
					<label class="industry-option">
						<input type="checkbox" name="industries" value={industry} />
						<span>{industry}</span>
					</label>
				{/each}
			</fieldset>

			<button type="submit" class="btn btn-primary" disabled={!data.cycleName}>
				Create and issue invite
			</button>
		</form>
	</div>

	<div class="panel">
		<div class="panel-head">
			<span>Roster</span>
			<span class="count-badge">{data.people.length}</span>
		</div>

		{#if data.people.length === 0}
			<p class="muted">Nobody has been added yet.</p>
		{:else}
			<div class="scroll">
				<table>
					<thead>
						<tr>
							<th>Name</th>
							<th>Role</th>
							<th>Industries</th>
							<th>Invite</th>
							<th>Reviewed</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each data.people as person (person.id)}
							<tr class:inactive={!person.active}>
								<td>
									<span class="person-name">
										{person.name}
										{#if !person.active}<span class="deactivated-tag">Deactivated</span>{/if}
									</span>
									<span class="person-email">{person.email}</span>
								</td>
								<td><span class="chip">{person.role}</span></td>
								<td>
									{#if person.industries.length === 0}
										<span class="unassigned">None</span>
									{:else}
										{person.industries.join(', ')}
									{/if}
								</td>
								<td>
									{#if person.inviteState.kind === 'active'}
										<span class="verdict-tag verdict-like">Active</span>
									{:else if person.inviteState.kind === 'invited'}
										<span class="verdict-tag verdict-meh">
											Invited · expires {formatDate(person.inviteState.expiresAt)}
										</span>
									{:else}
										<span class="verdict-tag verdict-flag">Needs invite</span>
									{/if}
								</td>
								<td class="mono">
									{person.summary.total}
									{#if person.summary.total > 0}
										<span class="breakdown">
											({person.summary.like}/{person.summary.meh}/{person.summary.skip}{#if person.summary.redFlags}
												· {person.summary.redFlags} flagged{/if})
										</span>
									{/if}
								</td>
								<td class="row-actions">
									{#if person.inviteState.kind !== 'active'}
										<form method="POST" action="?/regenerate">
											<input type="hidden" name="userId" value={person.id} />
											<input type="hidden" name="personName" value={person.name} />
											<button type="submit" class="link-btn">New invite</button>
										</form>
									{/if}
									{#if person.id !== data.currentUserId}
										<form method="POST" action="?/setActive">
											<input type="hidden" name="userId" value={person.id} />
											<input type="hidden" name="active" value={person.active ? 'false' : 'true'} />
											<button type="submit" class="link-btn" class:danger={person.active}>
												{person.active ? 'Deactivate' : 'Reactivate'}
											</button>
										</form>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</section>

<style>
	.wrap {
		max-width: 60rem;
		margin: 0 auto;
		padding: 2rem 1.25rem 4rem;
	}
	.page-head {
		margin-bottom: 1.75rem;
	}
	h1 {
		font-size: 2rem;
		margin: 0;
	}
	.cycle-name {
		color: var(--text-dim);
		font-style: italic;
		font-weight: 400;
	}
	.notice,
	.muted {
		color: var(--text-dim);
	}
	.form-error {
		background: var(--danger-soft);
		color: var(--danger);
		border: 1px solid var(--danger);
		border-radius: var(--radius-sm);
		padding: 0.7rem 0.9rem;
		margin-bottom: 1.25rem;
	}

	.invite-panel {
		background: var(--like-soft);
		border: 1px solid var(--like);
		border-radius: var(--radius-md);
		padding: 1.1rem;
		margin-bottom: 1.5rem;
	}
	.invite-title {
		font-weight: 700;
		margin: 0 0 0.35rem;
	}
	.invite-warning {
		color: var(--text-dim);
		font-size: 0.85rem;
		margin: 0 0 0.85rem;
		line-height: 1.55;
	}
	.invite-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		align-items: center;
	}
	.invite-row code {
		flex: 1;
		min-width: 16rem;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		background: var(--bg-raised-2);
		border-radius: var(--radius-sm);
		padding: 0.6rem 0.7rem;
		word-break: break-all;
	}

	.panel {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		padding: 1rem 1.1rem;
		margin-bottom: 1.5rem;
	}
	.panel-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 700;
		font-size: 0.9rem;
		margin-bottom: 1rem;
	}
	.count-badge {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		background: var(--bg-raised-2);
		border-radius: 999px;
		padding: 0.1rem 0.55rem;
		color: var(--text-dim);
	}

	.create-form {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
		gap: 1rem;
		align-items: end;
	}
	.create-form select {
		background: var(--bg-raised-2);
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
		color: var(--text);
		font: inherit;
		padding: 0.75rem 0.9rem;
		min-height: 46px;
	}
	.industries {
		grid-column: 1 / -1;
		border: 1px solid var(--line);
		border-radius: var(--radius-sm);
		padding: 0.75rem 0.9rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem 1.25rem;
	}
	.industry-option {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.88rem;
	}

	.scroll {
		overflow-x: auto;
	}
	table {
		border-collapse: collapse;
		width: 100%;
	}
	th,
	td {
		text-align: left;
		padding: 0.6rem 0.7rem;
		border-bottom: 1px solid var(--line);
		font-size: 0.88rem;
		vertical-align: top;
	}
	th {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-faint);
		font-weight: 600;
	}
	tr:last-child td {
		border-bottom: none;
	}
	.person-name {
		display: block;
		font-weight: 600;
	}
	.person-email {
		display: block;
		color: var(--text-faint);
		font-size: 0.78rem;
	}
	.unassigned {
		color: var(--danger);
	}
	.mono {
		font-family: var(--font-mono);
	}
	.breakdown {
		color: var(--text-faint);
		font-size: 0.74rem;
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
	.link-btn.danger {
		color: var(--danger);
	}
	.row-actions {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		align-items: flex-start;
	}
	tr.inactive .person-name,
	tr.inactive .person-email {
		opacity: 0.55;
	}
	.deactivated-tag {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--danger);
		border: 1px solid var(--danger);
		border-radius: 999px;
		padding: 0 0.4rem;
		margin-left: 0.35rem;
		white-space: nowrap;
	}
</style>
