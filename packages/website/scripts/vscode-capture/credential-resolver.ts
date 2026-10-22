// Capture-only replacement for packages/vscode-extension/src/profiles/credential-resolver.ts.
// build-vscode-capture.mjs swaps it in so documentation screenshots can drive the real Generate flow
// against atomize-core's Mock platform. It is never part of the published extension.
import { PlatformFactory } from '@sppg2001/atomize-core';
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

export interface CredentialResolver {
	resolveByName(profileName: string): Promise<IPlatformAdapter>;
}

export function createCredentialResolver(store: ProfileStore): CredentialResolver {
	return {
		async resolveByName(profileName: string): Promise<IPlatformAdapter> {
			if (!store.getByName(profileName)) throw new ProfileNotFoundError(profileName);
			const adapter = PlatformFactory.create('mock');
			await adapter.authenticate();
			return adapter;
		},
	};
}
