import type { IPlatformAdapter } from '@sppg2001/atomize-core/platforms/interfaces/platform.interface';
import { fetchProjectGrounding, type ProjectGrounding, toProjectGroundingError } from '@sppg2001/atomize-core/services/template/project-grounding';
import * as vscode from 'vscode';
import { getDefaultProfile } from '../config/atomize-configuration.js';
import type { CredentialResolver } from '../profiles/credential-resolver.js';
import { pickProfile } from '../profiles/profile-picker.js';
import type { ProfileStore } from '../profiles/profile-store.js';

export interface AIGroundingDeps {
	store: ProfileStore;
	credentialResolver: CredentialResolver;
}

export interface AIGrounding {
	/** The grounding Connection Profile's name, shown back to the user. */
	profile?: string;
	projectGrounding: ProjectGrounding | null;
	/** The chosen profile's connection, reused for reading wiki Reference Documents. */
	adapter?: IPlatformAdapter;
}

export interface AIGroundingOptions {
	title: string;
	/** Picks the workspace default profile. */
	resource: vscode.Uri | undefined;
	/** The choice that skips grounding, worded for the action. */
	noGrounding: { label: string; description: string };
	/** Says what the grounding was for, in the failure dialog, e.g. "The improvement". */
	purpose: string;
}

const UNGROUNDED: AIGrounding = { projectGrounding: null };

/**
 * Grounding for an AI draft or improvement (ADR-0069), always the user's explicit choice: a
 * Connection Profile brings Project Grounding. Grounding that can't load is retried, dropped, or
 * cancelled by the user, never dropped silently.
 */
export async function chooseAIGrounding(deps: AIGroundingDeps, options: AIGroundingOptions): Promise<AIGrounding | 'cancelled'> {
	const profile = await pickProfile(deps.store, deps.credentialResolver, {
		title: `${options.title} · Grounding`,
		allowOffline: true,
		defaultProfile: getDefaultProfile(options.resource),
		offlineChoice: options.noGrounding,
	});
	if (profile === null) return 'cancelled';
	if (profile === undefined) return UNGROUNDED;

	while (true) {
		try {
			return await vscode.window.withProgress(
				{ location: vscode.ProgressLocation.Notification, title: `Loading "${profile}" project metadata…` },
				async () => {
					const adapter = await deps.credentialResolver.resolveByName(profile);
					return { profile, projectGrounding: await fetchProjectGrounding(adapter), adapter };
				},
			);
		} catch (error) {
			const choice = await vscode.window.showWarningMessage(
				toProjectGroundingError(error).message,
				{ modal: true, detail: `${options.purpose} was going to use this project's metadata.` },
				'Retry',
				'Continue without grounding',
			);
			if (choice === 'Continue without grounding') return UNGROUNDED;
			if (choice !== 'Retry') return 'cancelled';
		}
	}
}
