import { describe, expect, it } from 'vitest';
import { VERDICT_LABEL } from '../../src/lib/verdictLabels';

describe('VERDICT_LABEL', () => {
	it('maps every rating value to its Title Case display label', () => {
		expect(VERDICT_LABEL).toEqual({ like: 'Good', meh: 'Meh', skip: 'Weak' });
	});
});
