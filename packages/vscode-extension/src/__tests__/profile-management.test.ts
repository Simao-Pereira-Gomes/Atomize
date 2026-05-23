import { describe, expect, it } from 'bun:test';

import {
	type AdoProfileJson,
	parseAdoProfilesJson,
	sanitizeCliError,
	sortAdoProfiles,
	supportsNativeRotation,
} from '../profile-management-model.js';

const profiles: AdoProfileJson[] = [
	{
		name: 'zeta',
		platform: 'azure-devops',
		isDefault: false,
		organizationUrl: 'https://dev.azure.com/acme',
		project: 'Product',
		team: 'Core',
		tokenStorage: 'keychain',
	},
	{
		name: 'alpha',
		platform: 'azure-devops',
		isDefault: true,
		organizationUrl: 'https://dev.azure.com/acme',
		project: 'Product',
		team: 'Core',
		tokenStorage: 'file',
	},
	{
		name: 'beta',
		platform: 'azure-devops',
		isDefault: false,
		organizationUrl: 'https://dev.azure.com/acme',
		project: 'Product',
		team: 'Core',
		tokenStorage: 'keychain',
	},
];

describe('profile-management helpers', () => {
	it('sorts default first, then alphabetically', () => {
		expect(sortAdoProfiles(profiles).map(p => p.name)).toEqual(['alpha', 'beta', 'zeta']);
	});

	it('parses only Azure DevOps profiles from auth list JSON', () => {
		const parsed = parseAdoProfilesJson(JSON.stringify([
			...profiles,
			{ name: 'ai', platform: 'github-models', isDefault: true, model: 'gpt-4o', tokenStorage: 'keychain' },
		]));
		expect(parsed?.map(p => p.name)).toEqual(['zeta', 'alpha', 'beta']);
	});

	it('rejects malformed auth list JSON', () => {
		expect(parseAdoProfilesJson('not json')).toBeUndefined();
		expect(parseAdoProfilesJson(JSON.stringify({ profiles }))).toBeUndefined();
	});

	it('allows native rotation only for keychain-backed profiles', () => {
		expect(supportsNativeRotation(profiles[0])).toBe(true);
		expect(supportsNativeRotation(profiles[1])).toBe(false);
		expect(supportsNativeRotation({ ...profiles[0], tokenStorage: undefined })).toBe(false);
	});

	it('compacts CLI error output', () => {
		expect(sanitizeCliError({ stderr: 'Error: failed\n', stdout: 'details' })).toBe('Error: failed details');
		expect(sanitizeCliError({ stderr: '   ', stdout: '' })).toBeUndefined();
	});
});
