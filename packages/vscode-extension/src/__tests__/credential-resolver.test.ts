import { describe, expect, test } from 'bun:test';
import { AuthenticatedAdapterCache } from '@sppg2001/atomize-core';
import type { IPlatformAdapter } from '@sppg2001/atomize-core/platforms/interfaces/platform.interface';
import { createCredentialResolver } from '../profiles/credential-resolver.js';
import type { ProfileStore } from '../profiles/profile-store.js';

function storeWith(tokens: Record<string, string>): ProfileStore {
	return {
		getByName: (name: string) => ({
			id: name,
			name,
			organizationUrl: 'https://dev.azure.com/org',
			project: 'P',
			team: 'T',
			isDefault: false,
			createdAt: '',
			updatedAt: '',
		}),
		getToken: async (id: string) => tokens[id],
	} as unknown as ProfileStore;
}

describe('createCredentialResolver', () => {
	test('authenticates a profile once and reuses its adapter, such as across validations on save', async () => {
		let authentications = 0;
		const cache = new AuthenticatedAdapterCache({
			create: () => ({ authenticate: async () => { authentications++; } }) as unknown as IPlatformAdapter,
		});
		const resolver = createCredentialResolver(storeWith({ work: 'pat' }), cache);

		const first = await resolver.resolveByName('work');
		const second = await resolver.resolveByName('work');

		expect(second).toBe(first);
		expect(authentications).toBe(1);
	});

	test('authenticates again after the profile token changes', async () => {
		let authentications = 0;
		const tokens: Record<string, string> = { work: 'pat-1' };
		const cache = new AuthenticatedAdapterCache({
			create: () => ({ authenticate: async () => { authentications++; } }) as unknown as IPlatformAdapter,
		});
		const resolver = createCredentialResolver(storeWith(tokens), cache);

		await resolver.resolveByName('work');
		tokens.work = 'pat-2';
		await resolver.resolveByName('work');

		expect(authentications).toBe(2);
	});
});
