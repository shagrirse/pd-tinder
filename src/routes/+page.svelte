<section class="hero">
	<div class="hero-deck" aria-hidden="true">
		<div class="hero-card c1"></div>
		<div class="hero-card c2"></div>
		<div class="hero-card c3">
			<span class="hero-card-stamp">✓</span>
		</div>
	</div>

	<p class="eyebrow">Blind review, one file at a time</p>
	<h1>pd<span class="slash">/</span>tinder</h1>
	<p class="lede">
		Rate mentee applicants blind — no names, no contact details, just the answers. Swipe through
		your pool, flag what shouldn't pass, and hand admins a ranked shortlist.
	</p>
	<a class="btn btn-primary" href="/login">Sign in to review</a>
</section>

<style>
	.hero {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 3rem 1.5rem;
	}
	.hero-deck {
		position: relative;
		width: 11rem;
		height: 7rem;
		margin-bottom: 1.75rem;
	}
	.hero-card {
		position: absolute;
		inset: 0;
		background: var(--paper);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-card);
	}
	.c1 {
		transform: rotate(-11deg) translateX(-1.2rem);
		opacity: 0.5;
	}
	.c2 {
		transform: rotate(7deg) translateX(1rem);
		opacity: 0.8;
	}
	.c3 {
		transform: rotate(-2deg);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.hero-card-stamp {
		font-family: var(--font-display);
		font-size: 2.1rem;
		font-weight: 800;
		color: var(--like);
	}
	h1 {
		font-family: var(--font-display);
		font-size: clamp(2.5rem, 9vw, 4rem);
		font-weight: 900;
		font-style: italic;
		margin: 0 0 1rem;
		letter-spacing: -0.02em;
	}
	.slash {
		color: var(--flame);
	}
	.lede {
		max-width: 32rem;
		color: var(--text-dim);
		font-size: 1.05rem;
		line-height: 1.65;
		margin: 0 0 2rem;
	}
</style>
