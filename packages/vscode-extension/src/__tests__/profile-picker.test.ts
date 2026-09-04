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

	it('returns undefined when name does not match any profile', () => {
		expect(resolveDefaultProfile(profiles, 'unknown-profile')).toBeUndefined();
	});

	it('returns undefined when defaultProfile is absent or blank', () => {
		expect(resolveDefaultProfile(profiles, undefined)).toBeUndefined();
		expect(resolveDefaultProfile(profiles, '')).toBeUndefined();
	});
});
