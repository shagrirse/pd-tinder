<script lang="ts">
	import { enhance } from '$app/forms';

	/**
	 * A member as it arrives over the wire. `$lib/server` is not reachable
	 * from client code, so this mirrors `RosterRow` (roster/list) plus the
	 * role the host page knows, the same pattern ApplicantDetailModal uses.
	 */
	type WireMember = {
		id: number;
		role: 'mentor' | 'mentee';
		fullName: string;
		email: string;
		industry: string | null;
		studentId: string | null;
		applicantId: number | null;
		telegram: string | null;
		linkedin: string | null;
	};

	let {
		member,
		actionUrl,
		onclose
	}: { member: WireMember | null; actionUrl: string; onclose: () => void } = $props();

	let copiedField = $state<string | null>(null);
	let editing = $state(false);
	let saving = $state(false);
	let editError = $state<string | null>(null);
	let telegramDraft = $state('');
	let linkedinDraft = $state('');
	let modalEl = $state<HTMLDivElement | undefined>();

	$effect(() => {
		if (member !== null && modalEl) modalEl.focus();
		// Opening (or reopening after the host page's data refreshed) resets
		// the edit form to the member's current values.
		editing = false;
		saving = false;
		editError = null;
		telegramDraft = member?.telegram ?? '';
		linkedinDraft = member?.linkedin ?? '';
	});

	async function copy(field: string, value: string) {
		try {
			await navigator.clipboard.writeText(value);
			copiedField = field;
			setTimeout(() => {
				if (copiedField === field) copiedField = null;
			}, 2000);
		} catch {
			// Clipboard blocked (private window, permissions): stay "Copy" and
			// leave the value selectable.
			copiedField = null;
		}
	}

	function handleEnhance() {
		return async ({
			update,
			result
		}: {
			update: (opts?: { reset?: boolean }) => Promise<void>;
			result: {
				type: 'success' | 'failure' | 'error' | 'redirect';
				data?: Record<string, unknown>;
			};
		}) => {
			saving = true;
			if (result.type === 'failure') {
				editError =
					typeof result.data?.updateError === 'string'
						? result.data.updateError
						: 'Could not save the contact details.';
				saving = false;
				return;
			}
			editError = null;
			editing = false;
			saving = false;
			await update({ reset: false });
		};
	}
</script>

{#if member !== null}
	<div
		class="backdrop"
		role="presentation"
		onclick={(event) => event.target === event.currentTarget && onclose()}
		onkeydown={(event) => event.key === 'Escape' && onclose()}
	>
		<div
			class="modal"
			role="dialog"
			aria-modal="true"
			aria-label="Member detail"
			tabindex="-1"
			bind:this={modalEl}
		>
			<button class="close" onclick={onclose} aria-label="Close">&times;</button>

			<div class="modal-head">
				<h2>{member.fullName}</h2>
				<div class="chips">
					<span class="chip">{member.role === 'mentor' ? 'Mentor' : 'Mentee'}</span>
					<span class="chip">{member.industry ?? 'No industry'}</span>
					{#if member.role === 'mentee' && member.applicantId === null}
						<span class="chip">No application</span>
					{/if}
				</div>
			</div>

			<div class="block">
				<h3>Contact</h3>
				<div class="contact-row">
					<span class="contact-label">Email</span>
					<a class="contact-value" href="mailto:{member.email}">{member.email}</a>
					<button type="button" class="copy-btn" onclick={() => copy('email', member.email)}>
						{copiedField === 'email' ? 'Copied' : 'Copy'}
					</button>
				</div>
				<div class="contact-row">
					<span class="contact-label">Telegram</span>
					{#if member.telegram}
						<a
							class="contact-value handle"
							href="https://t.me/{member.telegram}"
							target="_blank"
							rel="noreferrer"
						>
							{member.telegram}
						</a>
						<button
							type="button"
							class="copy-btn"
							onclick={() => copy('telegram', member.telegram!)}
						>
							{copiedField === 'telegram' ? 'Copied' : 'Copy'}
						</button>
					{:else}
						<span class="missing">Not provided</span>
					{/if}
				</div>
				<div class="contact-row">
					<span class="contact-label">LinkedIn</span>
					{#if member.linkedin}
						<a
							class="contact-value handle"
							href="https://www.linkedin.com/in/{member.linkedin}"
							target="_blank"
							rel="noreferrer"
						>
							{member.linkedin}
						</a>
						<button
							type="button"
							class="copy-btn"
							onclick={() => copy('linkedin', member.linkedin!)}
						>
							{copiedField === 'linkedin' ? 'Copied' : 'Copy'}
						</button>
					{:else}
						<span class="missing">Not provided</span>
					{/if}
				</div>
			</div>

			<div class="block">
				<h3>Details</h3>
				<div class="contact-row">
					<span class="contact-label">Student ID</span>
					{#if member.studentId}
						<span class="contact-value">{member.studentId}</span>
						<button
							type="button"
							class="copy-btn"
							onclick={() => copy('studentId', member.studentId!)}
						>
							{copiedField === 'studentId' ? 'Copied' : 'Copy'}
						</button>
					{:else}
						<span class="missing">Not provided</span>
					{/if}
				</div>
			</div>

			{#if editing}
				<form method="POST" action={actionUrl} class="edit-form" use:enhance={handleEnhance}>
					<input type="hidden" name="memberId" value={member.id} />
					<label class="field">
						<span class="field-label">Telegram</span>
						<input name="telegram" bind:value={telegramDraft} placeholder="adamentor" />
					</label>
					<label class="field">
						<span class="field-label">LinkedIn</span>
						<input name="linkedin" bind:value={linkedinDraft} placeholder="ada-mentor" />
					</label>
					{#if editError}<p class="form-error" role="alert">{editError}</p>{/if}
					<div class="edit-actions">
						<button type="submit" class="btn btn-primary" disabled={saving}>
							{saving ? 'Saving…' : 'Save changes'}
						</button>
						<button
							type="button"
							class="btn btn-ghost"
							onclick={() => {
								editing = false;
								editError = null;
							}}
						>
							Cancel
						</button>
					</div>
				</form>
			{:else}
				<button type="button" class="btn btn-ghost edit-toggle" onclick={() => (editing = true)}>
					Edit contact
				</button>
			{/if}
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 30;
		background: rgba(5, 10, 15, 0.72);
		backdrop-filter: blur(3px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.5rem;
	}
	.modal {
		position: relative;
		width: 100%;
		max-width: 30rem;
		max-height: 88vh;
		overflow-y: auto;
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		padding: 1.75rem;
		box-shadow: 0 30px 80px rgba(0, 0, 0, 0.55);
	}
	.close {
		position: absolute;
		top: 0.9rem;
		right: 1rem;
		background: none;
		border: none;
		color: var(--text-dim);
		font-size: 1.6rem;
		line-height: 1;
		cursor: pointer;
	}
	.close:hover {
		color: var(--text);
	}
	.modal-head h2 {
		font-size: 1.6rem;
		margin: 0 0 0.6rem;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.block {
		margin-top: 1.75rem;
	}
	.block h3 {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-faint);
		margin: 0 0 0.75rem;
		padding-bottom: 0.4rem;
		border-bottom: 1px solid var(--line);
	}
	.contact-row {
		display: grid;
		grid-template-columns: 6.5rem 1fr auto;
		align-items: center;
		gap: 0.5rem 0.75rem;
		padding: 0.4rem 0;
	}
	.contact-label {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-faint);
	}
	.contact-value {
		color: var(--text);
		text-decoration: underline;
		text-underline-offset: 2px;
		overflow-wrap: anywhere;
	}
	a.contact-value:hover {
		color: var(--flame);
	}
	.contact-value.handle {
		font-family: var(--font-mono);
		font-size: 0.85rem;
	}
	.missing {
		color: var(--text-faint);
		font-style: italic;
	}
	.copy-btn {
		background: none;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-pill);
		color: var(--text-dim);
		font: inherit;
		font-size: 0.75rem;
		padding: 0.15rem 0.6rem;
		cursor: pointer;
	}
	.copy-btn:hover {
		color: var(--text);
		border-color: var(--text-dim);
	}
	.edit-form {
		margin-top: 1.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}
	.edit-actions {
		display: flex;
		gap: 0.6rem;
	}
	.edit-toggle {
		margin-top: 1.5rem;
	}
	.form-error {
		background: var(--danger-soft);
		color: var(--danger);
		border: 1px solid var(--danger);
		border-radius: var(--radius-sm);
		padding: 0.7rem 0.9rem;
		margin: 0;
	}
</style>
