export function trapFocus(node: HTMLElement) {
	function handleKeydown(e: KeyboardEvent) {
		if (e.key !== 'Tab') return;
		const focusable = node.querySelectorAll<HTMLElement>(
			'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
		);
		if (focusable.length === 0) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	}
	node.addEventListener('keydown', handleKeydown);
	return { destroy: () => node.removeEventListener('keydown', handleKeydown) };
}
