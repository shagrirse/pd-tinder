<script lang="ts">
	import type { RatingValue } from '$lib/draft';

	/**
	 * `ApplicantDetail` from `$lib/server/results/detail` as it arrives over the wire.
	 * Identical except `submittedAt`, which JSON-serialises from a Date to an ISO string.
	 * Declared here rather than imported because `$lib/server` is not reachable from
	 * client code, and because the Date/string difference makes them genuinely
	 * different types rather than a duplication.
	 */
	type WireAnswer = {
		questionId: number;
		key: string;
		prompt: string;
		isRated: boolean;
		answerText: string;
		rating: RatingValue | null;
	};

	type WireDetail = {
		applicantId: number;
		publicRef: number;
		industry1: string;
		industry2: string | null;
		faculty: string | null;
		faculty2: string | null;
		gender: string | null;
		priorMentee: boolean;
		linkedinStatus: 'valid' | 'missing';
		submittedAt: string | null;
		fullName: string;
		email: string;
		smuEmail: string | null;
		studentId: string;
		contactNumber: string | null;
		telegram: string | null;
		linkedinUrl: string | null;
		score: number | null;
		rated: number;
		total: number;
		overall: RatingValue | null;
		redFlag: boolean;
		redFlagReason: string | null;
		note: string | null;
		reviewerName: string | null;
		answers: WireAnswer[];
	};

	let { applicantId, onclose }: { applicantId: number | null; onclose: () => void } = $props();

	let detail = $state<WireDetail | null>(null);
	let loadError = $state<string | null>(null);
	let loading = $state(false);
	let modalEl = $state<HTMLDivElement | undefined>();

	$effect(() => {
		if (applicantId !== null && modalEl) modalEl.focus();
	});

	$effect(() => {
		const id = applicantId;
		if (id === null) {
			detail = null;
			loadError = null;
			return;
		}

		let cancelled = false;
		loading = true;
		detail = null;
		loadError = null;

		fetch(`/results/applicant/${id}`)
			.then(async (response) => {
				if (!response.ok) throw new Error(`Could not load applicant #${id}.`);
				return (await response.json()) as WireDetail;
			})
			.then((loaded) => {
				if (cancelled) return;
				detail = loaded;
			})
			.catch((cause: Error) => {
				if (cancelled) return;
				loadError = cause.message;
			})
			.finally(() => {
				if (!cancelled) loading = false;
			});

		return () => {
			cancelled = true;
		};
	});

	function formatScore(score: number | null): string {
		if (score === null) return '—';
		return (score > 0 ? '+' : '') + score.toFixed(2);
	}

	function formatDate(value: string | null): string {
		if (!value) return '—';
		return new Date(value).toLocaleDateString();
	}
</script>

{#if applicantId !== null}
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
			aria-label="Applicant detail"
			tabindex="-1"
			bind:this={modalEl}
		>
			<button type="button" class="close" onclick={onclose} aria-label="Close">&times;</button>

			{#if loading}
				<p class="state">Loading…</p>
			{:else if loadError}
				<p class="state error" role="alert">{loadError}</p>
			{:else if detail}
				<header class="modal-head">
					<p class="eyebrow">Applicant #{detail.publicRef}</p>
					<h2>{detail.fullName}</h2>
					<div class="chips">
						<span class="chip chip-primary">{detail.industry1}</span>
						{#if detail.industry2}<span class="chip">2nd · {detail.industry2}</span>{/if}
						{#if detail.gender}<span class="chip">{detail.gender}</span>{/if}
						{#if detail.priorMentee}<span class="chip">Prior mentee</span>{/if}
					</div>
				</header>

				<section class="block">
					<h3>Contact</h3>
					<dl>
						<div><dt>Email</dt><dd>{detail.email}</dd></div>
						<div><dt>SMU email</dt><dd>{detail.smuEmail ?? '—'}</dd></div>
						<div><dt>Student ID</dt><dd>{detail.studentId}</dd></div>
						<div><dt>Phone</dt><dd>{detail.contactNumber ?? '—'}</dd></div>
						<div><dt>Telegram</dt><dd>{detail.telegram ?? '—'}</dd></div>
						<div>
							<dt>LinkedIn</dt>
							<dd>
								{#if detail.linkedinStatus === 'valid' && detail.linkedinUrl}
									<a href={detail.linkedinUrl} target="_blank" rel="noreferrer noopener">Profile</a>
								{:else}
									<span class="missing">Not provided</span>
								{/if}
							</dd>
						</div>
						<div><dt>Faculty</dt><dd>{detail.faculty ?? '—'}</dd></div>
						<div><dt>2nd faculty</dt><dd>{detail.faculty2 ?? '—'}</dd></div>
						<div><dt>Submitted</dt><dd>{formatDate(detail.submittedAt)}</dd></div>
					</dl>
				</section>

				<section class="block">
					<h3>Assessment</h3>
					{#if detail.reviewerName === null}
						<p class="muted">Not yet reviewed.</p>
					{:else}
						<dl>
							<div><dt>Score</dt><dd>{formatScore(detail.score)}</dd></div>
							<div><dt>Coverage</dt><dd>{detail.rated}/{detail.total}</dd></div>
							<div>
								<dt>Verdict</dt>
								<dd>
									{#if detail.redFlag}
										<span class="verdict-tag verdict-flag">Red flag</span>
									{:else if detail.overall}
										<span class="verdict-tag verdict-{detail.overall}">{detail.overall}</span>
									{:else}
										—
									{/if}
								</dd>
							</div>
							<div><dt>Reviewer</dt><dd>{detail.reviewerName}</dd></div>
						</dl>
						{#if detail.redFlagReason}
							<p class="reason"><strong>Red flag reason:</strong> {detail.redFlagReason}</p>
						{/if}
						{#if detail.note}
							<p class="reason"><strong>Note:</strong> {detail.note}</p>
						{/if}
					{/if}
				</section>

				<section class="block">
					<h3>Answers</h3>
					{#each detail.answers as answer (answer.questionId)}
						<article class="answer">
							<div class="answer-head">
								<h4>{answer.prompt}</h4>
								{#if answer.isRated}
									{#if answer.rating}
										<span class="verdict-tag verdict-{answer.rating}">{answer.rating}</span>
									{:else}
										<span class="verdict-tag verdict-unrated">unrated</span>
									{/if}
								{/if}
							</div>
							<p>{answer.answerText || '(no answer given)'}</p>
						</article>
					{/each}
				</section>
			{/if}
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 30;
		background: rgba(10, 6, 5, 0.72);
		backdrop-filter: blur(3px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.5rem;
	}
	.modal {
		position: relative;
		width: 100%;
		max-width: 44rem;
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
	.state {
		color: var(--text-dim);
		margin: 0;
	}
	.state.error {
		color: var(--danger);
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
	dl {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
		gap: 0.6rem 1.5rem;
		margin: 0;
	}
	dt {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-faint);
	}
	dd {
		margin: 0.1rem 0 0;
		font-size: 0.9rem;
		word-break: break-word;
	}
	.missing {
		color: var(--danger);
	}
	.muted {
		color: var(--text-dim);
		margin: 0;
	}
	.reason {
		margin: 0.75rem 0 0;
		font-size: 0.9rem;
		line-height: 1.6;
	}
	.answer {
		background: var(--bg-raised-2);
		border-radius: var(--radius-md);
		padding: 0.9rem 1rem;
		margin-bottom: 0.6rem;
	}
	.answer-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.75rem;
		margin-bottom: 0.4rem;
	}
	.answer h4 {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-dim);
		font-weight: 600;
		margin: 0;
	}
	.answer p {
		margin: 0;
		white-space: pre-wrap;
		font-size: 0.92rem;
		line-height: 1.6;
	}
	:global(.verdict-unrated) {
		background: rgba(244, 236, 224, 0.08);
		color: var(--text-faint);
	}
</style>
