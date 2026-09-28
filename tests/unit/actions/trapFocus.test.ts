import { describe, expect, it, vi } from 'vitest';
import { trapFocus } from '../../../src/lib/actions/trapFocus';

type FakeFocusable = { focus: () => void };

function fakeNode(focusables: FakeFocusable[]) {
	let handler: ((e: KeyboardEvent) => void) | undefined;
	const node = {
		querySelectorAll: () => focusables,
		addEventListener: (_type: string, fn: (e: KeyboardEvent) => void) => {
			handler = fn;
		},
		removeEventListener: vi.fn()
	};
	return {
		node: node as unknown as HTMLElement,
		removeEventListener: node.removeEventListener,
		fire: (event: KeyboardEvent) => handler?.(event)
	};
}

function fakeKeydown(key: string, shiftKey = false): KeyboardEvent {
	return { key, shiftKey, preventDefault: vi.fn() } as unknown as KeyboardEvent;
}

describe('trapFocus', () => {
	it('wraps Tab from the last focusable element to the first', () => {
		const first: FakeFocusable = { focus: vi.fn() };
		const last: FakeFocusable = { focus: vi.fn() };
		const { node, fire } = fakeNode([first, last]);
		vi.stubGlobal('document', { activeElement: last });

		trapFocus(node);
		const event = fakeKeydown('Tab');
		fire(event);

		expect(event.preventDefault).toHaveBeenCalled();
		expect(first.focus).toHaveBeenCalled();
		vi.unstubAllGlobals();
	});

	it('wraps Shift+Tab from the first focusable element to the last', () => {
		const first: FakeFocusable = { focus: vi.fn() };
		const last: FakeFocusable = { focus: vi.fn() };
		const { node, fire } = fakeNode([first, last]);
		vi.stubGlobal('document', { activeElement: first });

		trapFocus(node);
		const event = fakeKeydown('Tab', true);
		fire(event);

		expect(event.preventDefault).toHaveBeenCalled();
		expect(last.focus).toHaveBeenCalled();
		vi.unstubAllGlobals();
	});

	it('ignores keys other than Tab', () => {
		const only: FakeFocusable = { focus: vi.fn() };
		const { node, fire } = fakeNode([only]);
		vi.stubGlobal('document', { activeElement: only });

		trapFocus(node);
		const event = fakeKeydown('Escape');
		fire(event);

		expect(event.preventDefault).not.toHaveBeenCalled();
		expect(only.focus).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});

	it('does not wrap when focus is in the middle of the list', () => {
		const first: FakeFocusable = { focus: vi.fn() };
		const middle: FakeFocusable = { focus: vi.fn() };
		const last: FakeFocusable = { focus: vi.fn() };
		const { node, fire } = fakeNode([first, middle, last]);
		vi.stubGlobal('document', { activeElement: middle });

		trapFocus(node);
		fire(fakeKeydown('Tab'));

		expect(first.focus).not.toHaveBeenCalled();
		expect(last.focus).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});

	it('destroy removes the keydown listener', () => {
		const { node, removeEventListener } = fakeNode([]);
		const { destroy } = trapFocus(node);
		destroy();
		expect(removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
	});
});
