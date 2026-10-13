import type { IPlatformAdapter } from '@sppg2001/atomize-core/platforms/interfaces/platform.interface';
import { fetchProjectGrounding, type ProjectGrounding } from '@sppg2001/atomize-core/services/template/project-grounding';
import { fetchStoryGrounding, type StoryGrounding, toStoryGroundingError } from '@sppg2001/atomize-core/services/template/story-grounding';
import * as vscode from 'vscode';
import { getDefaultProfile } from '../config/atomize-configuration.js';
import type { CredentialResolver } from '../profiles/credential-resolver.js';
import { pickProfile } from '../profiles/profile-picker.js';
import type { ProfileStore } from '../profiles/profile-store.js';
import { browseStories, type DefaultView } from '../stories/story-browser.js';

export interface AIGroundingDeps {
	store: ProfileStore;
	credentialResolver: CredentialResolver;
}

export interface AIGrounding {
	/** The grounding Connection Profile's name, shown back to the user. */
	profile?: string;
	projectGrounding: ProjectGrounding | null;
	storyGrounding: StoryGrounding | null;
	/** The chosen profile's connection, reused for reading wiki Reference Documents. */
	adapter?: IPlatformAdapter;
}

export interface AIGroundingOptions {
	title: string;
	/** Picks the workspace default profile. */
	resource: vscode.Uri | undefined;
	/** The choice that skips grounding, worded for the action. */
	noGrounding: { label: string; description: string };
	/** Offers the Story Browser for Story Grounding, opening on `view`; omit to ground in project metadata only. */
	stories?: { view: DefaultView; placeholder: string };
	/** Says what the grounding was for, in the failure dialog, e.g. "The improvement". */
	purpose: string;
}

const UNGROUNDED: AIGrounding = { projectGrounding: null, storyGrounding: null };

/**
 * Grounding for an AI draft or improvement (ADR-0069), always the user's explicit choice: a
 * Connection Profile brings Project Grounding, and when `stories` is offered (improving only),
 * ticking Stories adds Story Grounding on top; ticking none keeps it to project metadata. Sensitive AI Context is a per-run choice. Grounding
 * that can't load is retried, dropped, or cancelled by the user, never dropped silently.
 */
export async function chooseAIGrounding(deps: AIGroundingDeps, options: AIGroundingOptions): Promise<AIGrounding | 'cancelled'> {
	const { title } = options;
	const profile = await pickProfile(deps.store, deps.credentialResolver, {
		title: `${title} · Grounding`,
		allowOffline: true,
		defaultProfile: getDefaultProfile(options.resource),
		offlineChoice: options.noGrounding,
	});
	if (profile === null) return 'cancelled';
	if (profile === undefined) return UNGROUNDED;

	let adapter: IPlatformAdapter | undefined;
	let storyIds: string[] | undefined = options.stories ? undefined : [];
	let includeSensitive = false;

	while (true) {
		try {
			adapter ??= await vscode.window.withProgress(
				{ location: vscode.ProgressLocation.Notification, title: `Connecting to "${profile}"…` },
				() => deps.credentialResolver.resolveByName(profile),
			);
			if (storyIds === undefined && options.stories) {
				const picked = await browseStories({
					title,
					adapter,
					defaultView: options.stories.view,
					canPickMany: true,
					placeholder: options.stories.placeholder,
					hasTasksByDefault: true,
				});
				if (picked === undefined) return 'cancelled';
				storyIds = picked;
				if (storyIds.length > 0) {
					const sensitive = await askSensitive(title);
					if (sensitive === undefined) return 'cancelled';
					includeSensitive = sensitive;
				}
			}

			const connected = adapter;
			const ids = storyIds ?? [];
			return await vscode.window.withProgress(
				{ location: vscode.ProgressLocation.Notification, title: ids.length > 0 ? 'Loading project metadata and Stories…' : 'Loading project metadata…' },
				async () => ({
					profile,
					projectGrounding: await fetchProjectGrounding(connected),
					storyGrounding: ids.length > 0 ? await fetchStoryGrounding(connected, ids, { includeSensitive }) : null,
					adapter: connected,
				}),
			);
		} catch (error) {
			const failure = toStoryGroundingError(error);
			const choice = await vscode.window.showWarningMessage(
				failure.message,
				{ modal: true, detail: `${options.purpose} was going to use this project's metadata${storyIds?.length ? ' and Stories' : ''}.` },
				'Retry',
				...(failure.code === 'GROUNDING_STORIES_UNUSABLE' ? ['Choose Other Stories'] : []),
				'Continue without grounding',
			);
			if (choice === 'Continue without grounding') return UNGROUNDED;
			if (choice === 'Choose Other Stories') storyIds = undefined;
			else if (choice !== 'Retry') return 'cancelled';
			if (failure.code !== 'GROUNDING_STORIES_UNUSABLE') adapter = undefined;
		}
	}
}

/** Sensitive AI Context is never sent by default and never remembered between runs. */
async function askSensitive(title: string): Promise<boolean | undefined> {
	const choice = await vscode.window.showQuickPick(
		[
			{ label: "Don't send descriptions", description: 'Recommended', include: false },
			{ label: 'Also send descriptions and acceptance criteria', description: 'They may contain customer, personal, or internal details', include: true },
		],
		{ title: `${title} · Story details`, placeHolder: 'Send the Stories’ descriptions and acceptance criteria to Copilot for this run?' },
	);
	return choice?.include;
}
