<script lang="ts">
	import { enhance } from '$app/forms';
	import RatingButtons from '$lib/components/RatingButtons.svelte';
	import RedFlagSheet from '$lib/components/RedFlagSheet.svelte';
	import VerdictIcon from '$lib/components/VerdictIcon.svelte';
	import { clearDraft, loadDraft, saveDraft, type RatingValue } from '$lib/draft';

	let { data, form } = $props();

	const EXIT_MS = 380;

	let ratings = $state<Record<number, RatingValue>>({});
	let note = $state('');
	let redFlagOpen = $state(false);
	let redFlag = $state(false);
	let redFlagReason = $state('');
	let exiting = $state<RatingValue | 'redFlag' | null>(null);
	let overallChoice = $state<RatingValue | null>(null);
	let formEl: HTMLFormElement | undefined = $state();
	let lastLoadedId: number | null = null;

	let applicantId = $derived(data.state === 'review' ? data.applicant.id : 0);
	let ratedQuestions = $derived(
		data.state === 'review' ? data.applicant.answers.filter((a) => a.isRated) : []
	);
	let ratedCount = $derived(Object.keys(ratings).length);
	let progressFraction = $derived(
		data.state === 'review' || data.state === 'empty'
			? Math.min(
					1,
					data.progress.reviewedByMe / Math.max(1, data.progress.reviewedByMe + data.progress.remaining)
				)
			: 0
	);

	const stampLabel: Record<string, string> = { like: 'Good', meh: 'Maybe', skip: 'Pass', redFlag: 'Rejected' };

	$effect(() => {
		if (data.state !== 'review') return;
		if (data.applicant.id === lastLoadedId) return;
		lastLoadedId = data.applicant.id;
		exiting = null;
		overallChoice = null;
		redFlagOpen = false;
		if (data.existing) {
			ratings = data.existing.ratings;
			note = data.existing.note;
			redFlag = data.existing.redFlag;
			redFlagReason = '';
		} else {
			redFlag = false;
			redFlagReason = '';
			const draft = loadDraft(data.applicant.id);
			ratings = draft?.ratings ?? {};
			note = draft?.note ?? '';
		}
	});

	function rate(questionId: number, value: RatingValue) {
		ratings = { ...ratings, [questionId]: value };
		persist();
	}

	function persist() {
		if (applicantId) saveDraft({ applicantId, ratings, note, updatedAt: Date.now() });
	}

	function sleep(ms: number) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	async function beginExit(kind: RatingValue) {
		if (exiting) return;
		overallChoice = kind;
		exiting = kind;
		clearDraft(applicantId);
		await sleep(EXIT_MS);
		formEl?.requestSubmit();
	}

	function confirmRedFlag(reason: string) {
		redFlag = true;
		redFlagReason = reason;
		redFlagOpen = false;
	}

	async function beginRedFlagExit() {
		if (exiting) return;
		exiting = 'redFlag';
		clearDraft(applicantId);
		await sleep(EXIT_MS);
		formEl?.requestSubmit();
	}

	// Robust fix for the sticky bar covering content: measure the bar's real
	// rendered height (it changes when the red-flag button appears) instead of
	// guessing a fixed padding value, and expose it as a CSS var the scroll
	// area reads for its bottom padding.
	function measureBar(node: HTMLElement) {
		const update = () => document.documentElement.style.setProperty('--verdict-h', `${node.offsetHeight}px`);
		update();
		const ro = new ResizeObserver(update);
		ro.observe(node);
		return { destroy: () => ro.disconnect() };
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.target instanceof HTMLTextAreaElement) return;
		if (exiting) return;
		const map: Record<string, RatingValue> = { '1': 'like', '2': 'meh', '3': 'skip' };
		const value = map[event.key];
		if (!value) return;
		document.querySelector<HTMLButtonElement>(`[data-verdict="${value}"]`)?.click();
	}

	const serialisedRatings = $derived(
		JSON.stringify(Object.entries(ratings).map(([questionId, value]) => ({ questionId: Number(questionId), value })))
	);
</script>

<svelte:window onkeydown={onKeydown} />

{#if data.state === 'no-cycle'}
	<section class="empty-state">
		<p class="eyebrow">Standby</p>
		<h1>No cycle is open</h1>
		<p>There's no recruitment cycle open for review right now. Check back once one starts.</p>
	</section>
{:else if data.state === 'empty'}
	<section class="empty-state">
		<p class="eyebrow">Deck complete</p>
		<h1>Nothing left in your pool</h1>
		<p>You reviewed {data.summary.total} applicant{data.summary.total === 1 ? '' : 's'}:</p>
		<div class="summary-grid">
			<div class="summary-tile like"><strong>{data.summary.like}</strong><span>Good</span></div>
			<div class="summary-tile meh"><strong>{data.summary.meh}</strong><span>Meh</span></div>
			<div class="summary-tile skip"><strong>{data.summary.skip}</strong><span>Weak</span></div>
			<div class="summary-tile danger"><strong>{data.summary.redFlags}</strong><span>Flagged</span></div>
		</div>
		<a class="btn btn-primary" href="/review/reviewed">Review what you submitted</a>
	</section>
{:else}
	<div class="progress-rail" aria-hidden="true">
		<div class="progress-fill" style:width="{progressFraction * 100}%"></div>
	</div>

	<div class="stage">
		<div class="deck">
			<div class="ghost-card ghost-2" aria-hidden="true"></div>
			<div class="ghost-card ghost-1" aria-hidden="true"></div>

			{#key data.applicant.id}
				<article
					class="card card-enter"
					class:exit-like={exiting === 'like'}
					class:exit-meh={exiting === 'meh'}
					class:exit-skip={exiting === 'skip'}
					class:exit-flag={exiting === 'redFlag'}
				>
					{#if exiting}
						<div class="stamp-overlay stamp-{exiting}" aria-hidden="true">{stampLabel[exiting]}</div>
					{/if}

					<header class="card-header">
						<div class="ref-row">
							<div class="ref-badge">
								<h1>Applicant #{data.applicant.publicRef}</h1>
							</div>
							<button
								type="button"
								class="flag-trigger"
								onclick={() => (redFlagOpen = true)}
								disabled={exiting !== null}
							>
								<svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16">
									<path
										d="M6 3v18M6 4h11l-2.5 4L17 12H6"
										fill="none"
										stroke="currentColor"
										stroke-width="1.8"
										stroke-linejoin="round"
									/>
								</svg>
								<span>Red flag</span>
							</button>
						</div>
						<div class="chips">
							<span class="chip chip-primary">{data.applicant.industry1}</span>
							{#if data.applicant.industry2}<span class="chip">2nd · {data.applicant.industry2}</span>{/if}
							{#if data.applicant.faculty}<span class="chip">{data.applicant.faculty}</span>{/if}
							{#if data.applicant.gender}<span class="chip">{data.applicant.gender}</span>{/if}
						</div>
						{#if data.applicant.linkedinMissing}
							<p class="warning">No LinkedIn profile provided</p>
						{/if}
						{#if data.claimReleased}
							<p class="notice-inline">
								Your previous applicant timed out and went back to the pool. Here's the next one.
							</p>
						{/if}
						{#if form?.error}<p class="warning" role="alert">{form.error}</p>{/if}
					</header>

					<div class="answers">
						{#each data.applicant.answers as answer (answer.questionId)}
							<section class="answer">
								<h2>{answer.prompt}</h2>
								<p>{answer.answerText || '(no answer given)'}</p>
								{#if answer.isRated}
									<RatingButtons
										label={answer.prompt}
										value={ratings[answer.questionId] ?? null}
										onchange={(v) => rate(answer.questionId, v)}
									/>
								{:else}
									<p class="context">Context only — not rated.</p>
								{/if}
							</section>
						{/each}
					</div>
				</article>
			{/key}
		</div>
	</div>

	<form method="POST" class="verdict-bar" bind:this={formEl} use:enhance use:measureBar>
		<input type="hidden" name="applicantId" value={applicantId} />
		<input type="hidden" name="ratings" value={serialisedRatings} />
		<input type="hidden" name="overall" value={overallChoice ?? ''} />
		<input type="hidden" name="redFlag" value={redFlag ? 'true' : 'false'} />
		<input type="hidden" name="redFlagReason" value={redFlagReason} />

		<textarea
			class="note-field"
			name="note"
			bind:value={note}
			oninput={persist}
			rows="1"
			placeholder="Note for the admin (optional)"
			aria-label="Note for the admin"
		></textarea>

		<div class="verdict-row">
			<span class="rated-count">{ratedCount}/{ratedQuestions.length} rated</span>
		</div>

		{#if redFlag}
			<button
				type="button"
				class="btn btn-danger btn-block"
				disabled={exiting !== null}
				onclick={beginRedFlagExit}
			>
				Submit red flag
			</button>
		{:else}
			<div class="verdicts">
				<button
					type="button"
					class="verdict-btn verdict-btn-skip"
					data-verdict="skip"
					disabled={exiting !== null}
					onclick={() => beginExit('skip')}
				>
					<VerdictIcon kind="skip" />
					<span>Weak</span>
				</button>
				<button
					type="button"
					class="verdict-btn verdict-btn-meh"
					data-verdict="meh"
					disabled={exiting !== null}
					onclick={() => beginExit('meh')}
				>
					<VerdictIcon kind="meh" />
					<span>Meh</span>
				</button>
				<button
					type="button"
					class="verdict-btn verdict-btn-like"
					data-verdict="like"
					disabled={exiting !== null}
					onclick={() => beginExit('like')}
				>
					<VerdictIcon kind="like" />
					<span>Good</span>
				</button>
			</div>
		{/if}
	</form>

	<RedFlagSheet open={redFlagOpen} onconfirm={confirmRedFlag} oncancel={() => (redFlagOpen = false)} />
{/if}

<style>
	.progress-rail {
		position: sticky;
		top: 0;
		z-index: 5;
		height: 3px;
		background: var(--line);
	}
	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, var(--flame-dim), var(--flame));
		transition: width 420ms cubic-bezier(0.3, 0.7, 0.4, 1);
	}

	.stage {
		max-width: 30rem;
		margin: 0 auto;
		padding: 1.5rem 1rem calc(var(--verdict-h, 230px) + 2rem);
	}

	.deck {
		position: relative;
	}
	.ghost-card {
		position: absolute;
		inset: 0;
		background: var(--paper-dim);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-card);
	}
	.ghost-1 {
		transform: scale(0.97) translateY(10px) rotate(-1.6deg);
		opacity: 0.85;
	}
	.ghost-2 {
		transform: scale(0.93) translateY(20px) rotate(2.1deg);
		opacity: 0.5;
		z-index: -1;
	}

	.card {
		position: relative;
		background: var(--paper);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-card);
		padding: 1.5rem 1.25rem 1.75rem;
		overflow: hidden;
	}
	.card-enter {
		animation: card-in 480ms cubic-bezier(0.22, 0.85, 0.25, 1) both;
	}
	@keyframes card-in {
		from {
			opacity: 0;
			transform: translateY(28px) rotate(-2deg) scale(0.96);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	.exit-like {
		animation: swipe-right 380ms cubic-bezier(0.4, 0, 1, 1) forwards;
	}
	.exit-skip {
		animation: swipe-left 380ms cubic-bezier(0.4, 0, 1, 1) forwards;
	}
	.exit-meh {
		animation: swipe-up 380ms cubic-bezier(0.4, 0, 1, 1) forwards;
	}
	.exit-flag {
		animation: swipe-drop 420ms cubic-bezier(0.4, 0, 1, 1) forwards;
	}
	@keyframes swipe-right {
		to {
			transform: translate(150%, -8%) rotate(20deg);
			opacity: 0;
		}
	}
	@keyframes swipe-left {
		to {
			transform: translate(-150%, -8%) rotate(-20deg);
			opacity: 0;
		}
	}
	@keyframes swipe-up {
		to {
			transform: translate(0, -130%) rotate(-3deg);
			opacity: 0;
		}
	}
	@keyframes swipe-drop {
		to {
			transform: translate(0, 10%) rotate(4deg) scale(0.92);
			opacity: 0;
		}
	}

	.stamp-overlay {
		position: absolute;
		top: 2rem;
		right: 1.5rem;
		z-index: 2;
		font-family: var(--font-mono);
		font-weight: 700;
		font-size: 1.5rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		padding: 0.4rem 1rem;
		border: 3px solid currentColor;
		border-radius: 0.4rem;
		transform: rotate(-14deg);
		animation: stamp-in 220ms cubic-bezier(0.2, 1.4, 0.4, 1) both;
	}
	@keyframes stamp-in {
		from {
			opacity: 0;
			transform: rotate(-14deg) scale(2);
		}
		to {
			opacity: 1;
			transform: rotate(-14deg) scale(1);
		}
	}
	.stamp-like {
		color: var(--like);
	}
	.stamp-meh {
		color: var(--meh);
	}
	.stamp-skip {
		color: var(--skip);
	}
	.stamp-redFlag {
		color: var(--danger);
		left: 1.5rem;
		right: auto;
	}

	.card-header {
		margin-bottom: 1.25rem;
	}
	.ref-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem;
	}
	.ref-badge {
		display: inline-block;
		border: 1.5px dashed var(--flame);
		border-radius: var(--radius-md);
		padding: 0.3rem 0.85rem;
		transform: rotate(-1.4deg);
	}
	.ref-badge h1 {
		margin: 0;
		font-size: 1.3rem;
		font-weight: 800;
		font-style: italic;
		color: var(--ink-on-paper);
	}
	.flag-trigger {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		background: none;
		border: none;
		color: var(--ink-on-paper-soft);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		cursor: pointer;
		padding: 0.4rem 0.3rem;
	}
	.flag-trigger:hover:not(:disabled) {
		color: var(--danger);
	}
	.flag-trigger:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: 0.9rem;
	}
	.warning {
		color: var(--danger);
		font-weight: 700;
		font-size: 0.85rem;
		margin: 0.75rem 0 0;
	}
	.notice-inline {
		color: var(--ink-on-paper-soft);
		font-size: 0.85rem;
		margin: 0.75rem 0 0;
		font-style: italic;
	}

	.answers {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-top: 1.25rem;
	}
	.answer {
		background: var(--paper-dim);
		border-radius: var(--radius-md);
		padding: 1rem 1.1rem;
	}
	.answer h2 {
		margin: 0 0 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--ink-on-paper-soft);
		font-weight: 600;
	}
	.answer p {
		margin: 0;
		white-space: pre-wrap;
		font-size: 0.98rem;
		line-height: 1.65;
		color: var(--ink-on-paper);
	}
	.context {
		color: var(--ink-on-paper-soft);
		font-size: 0.8rem;
		margin-top: 0.6rem;
		font-style: italic;
	}

	.verdict-bar {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 10;
		background: var(--bg-raised);
		border-top: 1px solid var(--line);
		padding: 0.85rem 1rem calc(env(safe-area-inset-bottom, 0px) + 0.9rem);
		box-shadow: 0 -12px 32px rgba(0, 0, 0, 0.35);
		max-width: 30rem;
		margin: 0 auto;
		box-sizing: border-box;
	}
	@media (min-width: 30rem) {
		.verdict-bar {
			left: 50%;
			right: auto;
			transform: translateX(-50%);
			width: 100%;
			border-left: 1px solid var(--line);
			border-right: 1px solid var(--line);
			border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		}
	}
	.note-field {
		width: 100%;
		box-sizing: border-box;
		resize: none;
		background: var(--bg-raised-2);
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
		color: var(--text);
		font: inherit;
		font-size: 0.9rem;
		padding: 0.55rem 0.75rem;
	}
	.note-field::placeholder {
		color: var(--text-faint);
	}
	.note-field:focus-visible {
		outline: none;
		border-color: var(--flame);
		box-shadow: 0 0 0 3px var(--flame-soft);
	}
	.verdict-row {
		display: flex;
		justify-content: flex-end;
		margin: 0.5rem 0;
	}
	.rated-count {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-dim);
		letter-spacing: 0.04em;
	}

	.verdicts {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.6rem;
	}
	.verdict-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
		min-height: 58px;
		border-radius: var(--radius-md);
		border: 1.5px solid var(--line);
		background: var(--bg-raised-2);
		color: var(--text-dim);
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 0.78rem;
		cursor: pointer;
		transition:
			transform 140ms ease,
			border-color 140ms ease,
			color 140ms ease;
	}
	.verdict-btn:active:not(:disabled) {
		transform: scale(0.94);
	}
	.verdict-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.verdict-btn-like:hover:not(:disabled),
	.verdict-btn-like:focus-visible {
		border-color: var(--like);
		color: var(--like);
	}
	.verdict-btn-meh:hover:not(:disabled),
	.verdict-btn-meh:focus-visible {
		border-color: var(--meh);
		color: var(--meh);
	}
	.verdict-btn-skip:hover:not(:disabled),
	.verdict-btn-skip:focus-visible {
		border-color: var(--skip);
		color: var(--skip);
	}

	.empty-state {
		max-width: 28rem;
		margin: 4rem auto;
		padding: 0 1.25rem;
		text-align: center;
	}
	.empty-state h1 {
		font-size: 2rem;
		margin: 0 0 0.75rem;
	}
	.summary-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.75rem;
		margin: 2rem 0;
	}
	.summary-tile {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		padding: 1rem;
		text-align: left;
	}
	.summary-tile strong {
		display: block;
		font-family: var(--font-display);
		font-size: 1.75rem;
	}
	.summary-tile span {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-dim);
	}
	.summary-tile.like strong {
		color: var(--like);
	}
	.summary-tile.meh strong {
		color: var(--meh);
	}
	.summary-tile.skip strong {
		color: var(--skip);
	}
	.summary-tile.danger strong {
		color: var(--danger);
	}
</style>
