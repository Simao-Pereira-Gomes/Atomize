import { describe, expect, it } from 'bun:test';

import { type AdoProfileJson, resolveDefaultProfile } from '../profiles/profile-management-model.js';

const profiles: AdoProfileJson[] = [
	{
		name: 'acme-prod',
		platform: 'azure-devops',
		isDefault: false,
		organizationUrl: 'https://dev.azure.com/acme',
		project: 'Product',
		team: 'Core',
	},
	{
		name: 'acme-staging',
		platform: 'azure-devops',
		isDefault: true,
		organizationUrl: 'https://dev.azure.com/acme',
		project: 'Staging',
		team: 'Core',
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
