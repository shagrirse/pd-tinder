export type RatingValue = 'like' | 'meh' | 'skip';

export type Draft = {
	applicantId: number;
	ratings: Record<number, RatingValue>;
	note: string;
	updatedAt: number;
};

export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const NOOP_STORAGE: DraftStorage = {
	getItem: () => null,
	setItem: () => {},
	removeItem: () => {}
};

function defaultStorage(): DraftStorage {
	try {
		return typeof localStorage === 'undefined' ? NOOP_STORAGE : localStorage;
	} catch {
		return NOOP_STORAGE;
	}
}

const key = (applicantId: number) => `pdt.draft.${applicantId}`;

export function loadDraft(
	applicantId: number,
	storage: DraftStorage = defaultStorage()
): Draft | null {
	try {
		const raw = storage.getItem(key(applicantId));
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Draft;
		return parsed.applicantId === applicantId ? parsed : null;
	} catch {
		return null;
	}
}

export function saveDraft(draft: Draft, storage: DraftStorage = defaultStorage()): void {
	try {
		storage.setItem(key(draft.applicantId), JSON.stringify(draft));
	} catch {
		// Storage unavailable. The server remains the source of truth.
	}
}

export function clearDraft(applicantId: number, storage: DraftStorage = defaultStorage()): void {
	try {
		storage.removeItem(key(applicantId));
	} catch {
		// Nothing to do.
	}
}
