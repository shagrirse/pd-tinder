<script lang="ts">
	import ApplicantDetailModal from '$lib/components/ApplicantDetailModal.svelte';

	let { data } = $props();

	let selectedApplicantId = $state<number | null>(null);

	function formatScore(score: number | null): string {
		if (score === null) return '—';
		return (score > 0 ? '+' : '') + score.toFixed(2);
	}

	function progressFor(industry: string) {
		return data.progress.find((p) => p.industry === industry) ?? null;
	}
</script>

<section class="wrap">
	<header class="page-head">
		<p class="eyebrow">Admin</p>
		<h1>Results{#if data.cycleName}<span class="cycle-name"> · {data.cycleName}</span>{/if}</h1>
	</header>

	{#if !data.cycleName}
		<p class="empty-note">No recruitment cycle is open.</p>
	{:else}
		<a class="btn btn-primary export-btn" href="/results/export">Download full CSV</a>

		{#each data.industries as industry (industry.industry)}
			<section class="industry">
				<h2>{industry.industry}</h2>

				{#if progressFor(industry.industry)}
					{@const stats = progressFor(industry.industry)!}
					<div class="progress-row">
						<div class="stat">
							<strong class="stat-reviewed">{stats.reviewed}</strong>
							<span>Reviewed</span>
						</div>
						<div class="stat">
							<strong class="stat-claimed">{stats.claimed}</strong>
							<span>In review</span>
						</div>
						<div class="stat">
							<strong class="stat-remaining">{stats.remaining}</strong>
							<span>Untouched</span>
						</div>
						<div class="stat stat-total">
							<strong>{stats.total}</strong>
							<span>Applicants</span>
						</div>
					</div>
					<div
						class="progress-bar"
						role="img"
						aria-label="{stats.reviewed} of {stats.total} reviewed"
					>
						<span class="bar-reviewed" style:width="{(stats.reviewed / stats.total) * 100}%"></span>
						<span class="bar-claimed" style:width="{(stats.claimed / stats.total) * 100}%"></span>
					</div>
				{/if}

				<div class="panel">
					<div class="panel-head">
						<span>Ranked</span>
						<span class="count-badge">{industry.ranked.length}</span>
					</div>
					{#if industry.ranked.length === 0}
						<p class="muted">Nothing reviewed yet.</p>
					{:else}
						<div class="scroll">
							<table>
								<thead>
									<tr>
										<th>#</th>
										<th>Name</th>
										<th>Score</th>
										<th>Coverage</th>
										<th>Verdict</th>
										<th>Reviewer</th>
									</tr>
								</thead>
								<tbody>
									{#each industry.ranked as applicant (applicant.applicantId)}
										<tr>
											<td class="mono">#{applicant.publicRef}</td>
											<td>
												<button
													type="button"
													class="name-btn"
													onclick={() => (selectedApplicantId = applicant.applicantId)}
												>
													{applicant.fullName}
												</button>
											</td>
											<td class="mono score">{formatScore(applicant.score)}</td>
											<td class="mono">{applicant.rated}/{applicant.total}</td>
											<td
												><span class="verdict-tag verdict-{applicant.overall}">{applicant.overall}</span
												></td
											>
											<td class="muted">{applicant.reviewerName ?? ''}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</div>

				{#if industry.rejected.length > 0}
					<div class="panel panel-danger">
						<div class="panel-head">
							<span>Rejected · red flagged</span>
							<span class="count-badge danger">{industry.rejected.length}</span>
						</div>
						<ul class="reject-list">
							{#each industry.rejected as applicant (applicant.applicantId)}
								<li>
									<span class="mono">#{applicant.publicRef}</span>
									<button
										type="button"
										class="name-btn"
										onclick={() => (selectedApplicantId = applicant.applicantId)}
									>
										{applicant.fullName}
									</button>
									<span class="reject-reason">{applicant.redFlagReason}</span>
									<span class="muted">— {applicant.reviewerName}</span>
								</li>
							{/each}
						</ul>
					</div>
				{/if}

			</section>
		{/each}
	{/if}

	<ApplicantDetailModal
		applicantId={selectedApplicantId}
		onclose={() => (selectedApplicantId = null)}
	/>
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
	.empty-note {
		color: var(--text-dim);
	}
	.export-btn {
		display: inline-flex;
		margin-bottom: 2.25rem;
		text-decoration: none;
	}

	.industry {
		margin-bottom: 2.5rem;
	}
	.industry h2 {
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.07em;
		font-size: 0.85rem;
		color: var(--text-dim);
		margin: 0 0 0.75rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid var(--line);
	}

	.panel {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		padding: 1rem 1.1rem;
		margin-bottom: 1rem;
	}
	.panel-danger {
		border-color: rgba(226, 56, 44, 0.35);
		background: var(--danger-soft);
	}
	.panel-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 700;
		font-size: 0.9rem;
		margin-bottom: 0.75rem;
	}
	.count-badge {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		background: var(--bg-raised-2);
		border-radius: 999px;
		padding: 0.1rem 0.55rem;
		color: var(--text-dim);
	}
	.count-badge.danger {
		background: var(--danger);
		color: #fff;
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
		padding: 0.5rem 0.7rem;
		border-bottom: 1px solid var(--line);
		white-space: nowrap;
		font-size: 0.88rem;
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
	.mono {
		font-family: var(--font-mono);
	}
	.score {
		font-weight: 700;
	}
	.muted {
		color: var(--text-dim);
	}

	.reject-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.reject-list li {
		font-size: 0.88rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		align-items: baseline;
	}
	.reject-reason {
		color: var(--text);
	}

	.progress-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
		gap: 0.75rem;
		margin-bottom: 0.6rem;
	}
	.stat {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		padding: 0.7rem 0.9rem;
	}
	.stat strong {
		display: block;
		font-family: var(--font-display);
		font-size: 1.5rem;
		line-height: 1.1;
	}
	.stat span {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-faint);
	}
	.stat-reviewed {
		color: var(--like);
	}
	.stat-claimed {
		color: var(--meh);
	}
	.stat-remaining {
		color: var(--text-dim);
	}
	.stat-total strong {
		color: var(--text-dim);
	}
	.progress-bar {
		display: flex;
		height: 6px;
		border-radius: 999px;
		overflow: hidden;
		background: var(--bg-raised-2);
		margin-bottom: 1rem;
	}
	.bar-reviewed {
		background: var(--like);
	}
	.bar-claimed {
		background: var(--meh);
	}
	.name-btn {
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		font-weight: 600;
		color: var(--flame);
		cursor: pointer;
		text-align: left;
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.name-btn:hover {
		filter: brightness(1.15);
	}
</style>
