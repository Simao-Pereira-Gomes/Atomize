import { buildAzureDevOpsConfig, PlatformFactory } from '@sppg2001/atomize-core';
import type { IPlatformAdapter } from '@sppg2001/atomize-core/platforms/interfaces/platform.interface';
import type { ProfileStore } from './profile-store.js';

export class ProfileNotFoundError extends Error {
	constructor(public readonly profileName: string) {
		super(`Profile "${profileName}" not found.`);
	}
}

export class MissingTokenError extends Error {
	constructor(public readonly profileName: string) {
		super(`No stored token for profile "${profileName}". Remove and re-add it.`);
	}
}

/**
 * The extension's implementation of atomize-core's credential-injection
 * interface (ADR-0038/ADR-0040): resolves a stored profile's fields + token
 * and hands back a live, authenticated platform adapter. Constructor-injected
 * (Q4) so callers can substitute a fake in tests.
 */
export interface CredentialResolver {
	resolveByName(profileName: string): Promise<IPlatformAdapter>;
}

export function createCredentialResolver(store: ProfileStore): CredentialResolver {
	return {
		async resolveByName(profileName: string): Promise<IPlatformAdapter> {
			const profile = store.getByName(profileName);
			if (!profile) throw new ProfileNotFoundError(profileName);

			const token = await store.getToken(profile.id);
			if (!token) throw new MissingTokenError(profileName);

			const config = buildAzureDevOpsConfig(
				{ organizationUrl: profile.organizationUrl, project: profile.project, team: profile.team },
				token,
			);
			const adapter = PlatformFactory.create('azure-devops', config);
			await adapter.authenticate();
			return adapter;
		},
	};
}
