import type { SubmitFunction } from '@sveltejs/kit';

export function createPendingSubmit(options?: {
	onFailure?: (data: Record<string, unknown> | undefined) => void;
	onSuccess?: () => void;
	reset?: boolean;
}) {
	let pending = $state(false);
	const submit: SubmitFunction = () => {
		pending = true;
		return async ({ update, result }) => {
			if (result.type === 'failure') options?.onFailure?.(result.data);
			else options?.onSuccess?.();
			await update({ reset: options?.reset ?? true });
			pending = false;
		};
	};
	return {
		get pending() {
			return pending;
		},
		submit
	};
}
