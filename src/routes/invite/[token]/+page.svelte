<script lang="ts">
	import AuthCard from '$lib/components/AuthCard.svelte';
	let { form } = $props();
</script>

<AuthCard>
	<h1>Set your password</h1>
	<p class="hint">Pick something you don't use anywhere else. At least 12 characters.</p>

	{#if form?.error}<p class="form-error" role="alert">{form.error}</p>{/if}

	<form method="POST" class="auth-form">
		<label class="field">
			<span class="field-label">Password</span>
			<input name="password" type="password" required minlength="12" autocomplete="new-password" />
		</label>
		<button type="submit" class="btn btn-primary btn-block">Set password and sign in</button>
	</form>
</AuthCard>
