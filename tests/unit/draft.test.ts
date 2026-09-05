import { beforeEach, describe, expect, it } from 'vitest';
import { clearDraft, loadDraft, saveDraft, type DraftStorage } from '../../src/lib/draft';

function fakeStorage(): DraftStorage {
	const map = new Map<string, string>();
	return {
		getItem: (k) => map.get(k) ?? null,
		setItem: (k, v) => void map.set(k, v),
		removeItem: (k) => void map.delete(k)
	};
}

const throwingStorage: DraftStorage = {
	getItem: () => {
		throw new Error('blocked');
	},
	setItem: () => {
		throw new Error('blocked');
	},
	removeItem: () => {
		throw new Error('blocked');
	}
};

let storage: DraftStorage;
beforeEach(() => {
	storage = fakeStorage();
});

describe('drafts', () => {
	it('round-trips a draft', () => {
		saveDraft({ applicantId: 7, ratings: { 3: 'like' }, note: 'promising', updatedAt: 1 }, storage);
		expect(loadDraft(7, storage)).toEqual({
			applicantId: 7,
			ratings: { 3: 'like' },
			note: 'promising',
			updatedAt: 1
		});
	});

	it('keeps drafts for different applicants separate', () => {
		saveDraft({ applicantId: 1, ratings: { 1: 'like' }, note: '', updatedAt: 1 }, storage);
		saveDraft({ applicantId: 2, ratings: { 1: 'skip' }, note: '', updatedAt: 1 }, storage);
		expect(loadDraft(1, storage)!.ratings[1]).toBe('like');
		expect(loadDraft(2, storage)!.ratings[1]).toBe('skip');
	});

	it('returns null when there is no draft', () => {
		expect(loadDraft(99, storage)).toBeNull();
	});

	it('clears a draft', () => {
		saveDraft({ applicantId: 7, ratings: {}, note: '', updatedAt: 1 }, storage);
		clearDraft(7, storage);
		expect(loadDraft(7, storage)).toBeNull();
	});

	it('returns null for corrupted stored JSON instead of throwing', () => {
		storage.setItem('pdt.draft.7', '{not json');
		expect(loadDraft(7, storage)).toBeNull();
	});

	it('never throws when storage is unavailable', () => {
		expect(() => saveDraft({ applicantId: 1, ratings: {}, note: '', updatedAt: 1 }, throwingStorage)).not.toThrow();
		expect(loadDraft(1, throwingStorage)).toBeNull();
		expect(() => clearDraft(1, throwingStorage)).not.toThrow();
	});
});
