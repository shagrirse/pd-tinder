import { describe, expect, it, vi } from 'vitest';
import { createPendingSubmit } from '../../../src/lib/actions/pendingSubmit.svelte';

function fakeSubmitInput() {
	return {
		action: new URL('http://localhost/'),
		formData: new FormData(),
		formElement: {} as HTMLFormElement,
		controller: new AbortController(),
		submitter: null,
		cancel: () => {}
	};
}

function fakeCallbackInput(
	result:
		| { type: 'success'; status: number; data?: Record<string, unknown> }
		| { type: 'failure'; status: number; data?: Record<string, unknown> }
		| { type: 'redirect'; status: number; location: string },
	update: (options?: { reset?: boolean; invalidateAll?: boolean }) => Promise<void> = async () => {}
) {
	return {
		formData: new FormData(),
		formElement: {} as HTMLFormElement,
		action: new URL('http://localhost/'),
		result,
		update
	};
}

describe('createPendingSubmit', () => {
	it('is pending while the request is in flight and clears after success', async () => {
		const helper = createPendingSubmit();
		const callback = await helper.submit(fakeSubmitInput());
		expect(helper.pending).toBe(true);

		await callback?.(fakeCallbackInput({ type: 'success', status: 200 }));

		expect(helper.pending).toBe(false);
	});

	it('calls onFailure with the result data on a failure result', async () => {
		const onFailure = vi.fn();
		const helper = createPendingSubmit({ onFailure });
		const callback = await helper.submit(fakeSubmitInput());

		await callback?.(fakeCallbackInput({ type: 'failure', status: 400, data: { error: 'nope' } }));

		expect(onFailure).toHaveBeenCalledWith({ error: 'nope' });
	});

	it('calls onSuccess on any non-failure result', async () => {
		const onSuccess = vi.fn();
		const helper = createPendingSubmit({ onSuccess });
		const callback = await helper.submit(fakeSubmitInput());

		await callback?.(fakeCallbackInput({ type: 'redirect', status: 303, location: '/' }));

		expect(onSuccess).toHaveBeenCalled();
	});

	it('resets the form by default, but honours reset: false', async () => {
		const update = vi.fn(async () => {});
		const helper = createPendingSubmit({ reset: false });
		const callback = await helper.submit(fakeSubmitInput());

		await callback?.(fakeCallbackInput({ type: 'success', status: 200 }, update));

		expect(update).toHaveBeenCalledWith({ reset: false });
	});
});
