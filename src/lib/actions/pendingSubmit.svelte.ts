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
			try {
				if (result.type === 'failure') options?.onFailure?.(result.data);
				else if (result.type === 'error') options?.onFailure?.(undefined);
				else options?.onSuccess?.();
				await update({ reset: options?.reset ?? true });
			} finally {
				pending = false;
			}
		};
	};
	return {
		get pending() {
			return pending;
		},
		submit
	};
}
