import { describe, expect, it } from 'bun:test';

import { resolveDefaultProfile } from '../profiles/profile-helpers.js';
import type { AzureDevOpsProfileMeta } from '../profiles/profile-store.js';

const profiles: AzureDevOpsProfileMeta[] = [
	{
		id: '1',
		name: 'acme-prod',
		isDefault: false,
		organizationUrl: 'https://dev.azure.com/acme',
		project: 'Product',
		team: 'Core',
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
	},
	{
		id: '2',
		name: 'acme-staging',
		isDefault: true,
		organizationUrl: 'https://dev.azure.com/acme',
		project: 'Staging',
		team: 'Core',
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
	},
];

describe('resolveDefaultProfile', () => {
	it('returns the matching profile when name matches exactly', () => {
		const result = resolveDefaultProfile(profiles, 'acme-prod');
		expect(result?.name).toBe('acme-prod');
	});

	it('falls back to the stored default when the setting names no known profile', () => {
		expect(resolveDefaultProfile(profiles, 'unknown-profile')?.name).toBe('acme-staging');
	});

	it('falls back to the stored default when the setting is absent or blank', () => {
		expect(resolveDefaultProfile(profiles, undefined)?.name).toBe('acme-staging');
		expect(resolveDefaultProfile(profiles, '')?.name).toBe('acme-staging');
	});

	it('returns undefined when neither the setting nor a stored default applies', () => {
		const withoutDefault = profiles.map(profile => ({ ...profile, isDefault: false }));
		expect(resolveDefaultProfile(withoutDefault, undefined)).toBeUndefined();
		expect(resolveDefaultProfile(withoutDefault, 'unknown-profile')).toBeUndefined();
	});
});
