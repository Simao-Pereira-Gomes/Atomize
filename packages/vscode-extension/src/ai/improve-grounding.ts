import type { IPlatformAdapter } from '@sppg2001/atomize-core/platforms/interfaces/platform.interface';
import { fetchProjectGrounding, type ProjectGrounding } from '@sppg2001/atomize-core/services/template/project-grounding';
import { fetchStoryGrounding, type StoryGrounding, toStoryGroundingError } from '@sppg2001/atomize-core/services/template/story-grounding';
import type { FilterCriteria as TemplateFilter } from '@sppg2001/atomize-core/templates/schema';
import * as vscode from 'vscode';
import { getDefaultProfile } from '../config/atomize-configuration.js';
import type { CredentialResolver } from '../profiles/credential-resolver.js';
import { pickProfile } from '../profiles/profile-picker.js';
import type { ProfileStore } from '../profiles/profile-store.js';
import { browseStories } from '../stories/story-browser.js';

export interface ImproveGroundingDeps {
	store: ProfileStore;
	credentialResolver: CredentialResolver;
}

export interface ImproveGrounding {
	projectGrounding: ProjectGrounding | null;
	storyGrounding: StoryGrounding | null;
}

const UNGROUNDED: ImproveGrounding = { projectGrounding: null, storyGrounding: null };

/**
 * Grounding for a Template Improvement (ADR-0069), always the user's explicit choice: a Connection
 * Profile brings Project Grounding, and ticking Stories the Template was applied to adds Story
 * Grounding on top; ticking none keeps it to project metadata. Sensitive AI Context is a per-run
 * choice. Grounding that can't load is retried, dropped, or cancelled by the user.
 */
export async function chooseImproveGrounding(
	deps: ImproveGroundingDeps,
	templateFilter: TemplateFilter,
	title: string,
	resource: vscode.Uri,
): Promise<ImproveGrounding | 'cancelled'> {
	const profile = await pickProfile(deps.store, deps.credentialResolver, {
		title: `${title} — Grounding`,
		allowOffline: true,
		defaultProfile: getDefaultProfile(resource),
		offlineChoice: { label: 'No grounding', description: 'Review the Template on its own' },
	});
	if (profile === null) return 'cancelled';
	if (profile === undefined) return UNGROUNDED;

	let adapter: IPlatformAdapter | undefined;
	let storyIds: string[] | undefined;
	let includeSensitive = false;

	while (true) {
		try {
			adapter ??= await vscode.window.withProgress(
				{ location: vscode.ProgressLocation.Notification, title: `Connecting to "${profile}"…` },
				() => deps.credentialResolver.resolveByName(profile),
			);
			if (storyIds === undefined) {
				const picked = await browseStories({
					title,
					adapter,
					defaultView: { kind: 'applied', templateFilter },
					canPickMany: true,
					placeholder: 'Tick Stories to learn from, or press Enter with none for project metadata only.',
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
			const ids = storyIds;
			return await vscode.window.withProgress(
				{ location: vscode.ProgressLocation.Notification, title: ids.length > 0 ? 'Loading project metadata and Stories…' : 'Loading project metadata…' },
				async () => ({
					projectGrounding: await fetchProjectGrounding(connected),
					storyGrounding: ids.length > 0 ? await fetchStoryGrounding(connected, ids, { includeSensitive }) : null,
				}),
			);
		} catch (error) {
			const failure = toStoryGroundingError(error);
			const choice = await vscode.window.showWarningMessage(
				failure.message,
				{ modal: true, detail: "The improvement was going to use this project's metadata and Stories." },
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
		{ title: `${title} — Story details`, placeHolder: 'Send the Stories’ descriptions and acceptance criteria to Copilot for this run?' },
	);
	return choice?.include;
}
