<script lang="ts">
	import AuthCard from '$lib/components/AuthCard.svelte';
	let { form } = $props();
</script>

<AuthCard>
	<h1>Sign in</h1>
	<p class="hint">Use the credentials your admin sent you.</p>

	{#if form?.error}<p class="form-error" role="alert">{form.error}</p>{/if}

	<form method="POST" class="auth-form">
		<label class="field">
			<span class="field-label">Email</span>
			<input name="email" type="email" required autocomplete="email" />
		</label>
		<label class="field">
			<span class="field-label">Password</span>
			<input name="password" type="password" required autocomplete="current-password" />
		</label>
		<button type="submit" class="btn btn-primary btn-block">Sign in</button>
	</form>
</AuthCard>
