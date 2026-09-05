import { describe, expect, it } from 'vitest';
import {
	classifyLinkedin,
	normalizeGender,
	normalizeIndustry,
	normalizePriorMentee
} from '../../../src/lib/server/import/normalize';

describe('normalizeIndustry', () => {
	it('passes through canonical values', () => {
		expect(normalizeIndustry('Finance')).toBe('Finance');
		expect(normalizeIndustry('Tech')).toBe('Tech');
		expect(normalizeIndustry('Consulting')).toBe('Consulting');
		expect(normalizeIndustry('Marketing')).toBe('Marketing');
		expect(normalizeIndustry('Niche')).toBe('Niche');
	});

	it('corrects the FInance capitalisation typo in the source data', () => {
		expect(normalizeIndustry('FInance')).toBe('Finance');
	});

	it('unifies both spellings of the HR option', () => {
		expect(normalizeIndustry('HR /Ops')).toBe('HR/Ops');
		expect(normalizeIndustry('Human Resource / Ops')).toBe('HR/Ops');
	});

	it('tolerates surrounding and repeated whitespace', () => {
		expect(normalizeIndustry('  Finance  ')).toBe('Finance');
		expect(normalizeIndustry('HR  /Ops')).toBe('HR/Ops');
	});

	it('returns null for unrecognised values', () => {
		expect(normalizeIndustry('Aerospace')).toBeNull();
		expect(normalizeIndustry('')).toBeNull();
	});
});

describe('classifyLinkedin', () => {
	it('accepts a real profile URL', () => {
		expect(classifyLinkedin('https://www.linkedin.com/in/some-person-123')).toBe('valid');
		expect(classifyLinkedin('linkedin.com/in/someone')).toBe('valid');
		expect(classifyLinkedin('HTTPS://WWW.LINKEDIN.COM/IN/SHOUTY')).toBe('valid');
	});

	it('rejects the non-profile values found in the real data', () => {
		expect(classifyLinkedin('')).toBe('missing');
		expect(classifyLinkedin('Nil')).toBe('missing');
		expect(classifyLinkedin('NIL')).toBe('missing');
		expect(classifyLinkedin('-')).toBe('missing');
		expect(classifyLinkedin('NA')).toBe('missing');
		expect(classifyLinkedin('I dont have, not active yet')).toBe('missing');
		expect(classifyLinkedin('Javier Khoo')).toBe('missing');
	});

	it('rejects a generic feed link that is not a profile', () => {
		expect(classifyLinkedin('https://www.linkedin.com/me?trk=p_mwlite_feed-secondary_nav')).toBe(
			'missing'
		);
	});
});

describe('normalizePriorMentee', () => {
	it('reads the 2026 answer as false', () => {
		expect(normalizePriorMentee("No, I'm new to TMC")).toBe(false);
	});

	it('reads an affirmative answer as true', () => {
		expect(normalizePriorMentee('Yes, I was a mentee before')).toBe(true);
	});
});

describe('normalizeGender', () => {
	it('passes through the known values', () => {
		expect(normalizeGender('Male')).toBe('Male');
		expect(normalizeGender('Female')).toBe('Female');
		expect(normalizeGender('Prefer not to say')).toBe('Prefer not to say');
	});

	it('returns null for a blank value', () => {
		expect(normalizeGender('   ')).toBeNull();
	});
});
