import { requireProjectMetadataReader } from '@sppg2001/atomize-core/platforms/capabilities';
import type { IPlatformAdapter } from '@sppg2001/atomize-core/platforms/interfaces/platform.interface';
import {
	listSprintStories,
	STORY_SEARCH_LIMIT,
	STORY_SEARCH_MAX,
	type StorySummary,
	searchStories,
} from '@sppg2001/atomize-core/services/story-search';
import * as vscode from 'vscode';
import { resolveDocumentPath } from '../catalog/catalog-document-path.js';
import { createTemplateLibrary } from '../core-library.js';
import type { CredentialResolver } from '../profiles/credential-resolver.js';
import {
	browserTitle,
	canLoadMore,
	emptyFilters,
	parseStoryIds,
	type StoryBrowserFilters,
	type StoryBrowserModeKind,
	storyDescription,
	storyLabel,
	toStorySearch,
	withSelectedFirst,
} from './story-browser-model.js';

export interface StoryBrowserOptions {
	/** Prefix for the QuickPick title, e.g. "Atomize: Generate". */
	title: string;
	adapter: IPlatformAdapter;
	/**
	 * Opens on the sprint view: Stories of these types in the current or next sprint with no Tasks
	 * yet and not closed, with Search one button away. Omit to open straight in Search.
	 */
	sprintView?: { workItemTypes?: string[] };
	canPickMany: boolean;
	placeholder: string;
	/** Whether Search starts with "Has Tasks" on (true for AI grounding, false for generation). */
	hasTasksByDefault?: boolean;
}

type StoryItem = vscode.QuickPickItem & { story?: StorySummary; loadMore?: true };
type Action = 'switchMode' | 'enterIds' | 'type' | 'state' | 'area' | 'iteration' | 'hasTasks';
type ActionButton = vscode.QuickInputButton & { action: Action };
type Outcome = { kind: 'done'; ids: string[] } | { kind: 'cancelled' } | { kind: 'action'; action: Action };

const SEARCH_DEBOUNCE_MS = 300;

/**
 * The VS Code Story Browser (see CONTEXT.md): a QuickPick that lists a default set of Stories or
 * runs a Story Search as the user types, narrowed by title-bar filters, with "Load more…" for
 * further pages and a button to type Story IDs directly. Resolves with the chosen Story IDs
 * (possibly none), or undefined when dismissed.
 */
export async function browseStories(options: StoryBrowserOptions): Promise<string[] | undefined> {
	const state = {
		mode: (options.sprintView ? 'sprint' : 'search') as StoryBrowserModeKind,
		filters: emptyFilters(options.hasTasksByDefault ?? false),
		selected: new Map<string, StorySummary>(),
		limit: STORY_SEARCH_LIMIT,
	};
	const metadata = new ProjectChoices(options.adapter);

	// Sub-pickers can't open while the browser is visible, so each action hides it, asks, and
	// reopens the browser with the same mode, filters, and selection.
	while (true) {
		const outcome = await showBrowser();
		if (outcome.kind === 'done') return outcome.ids;
		if (outcome.kind === 'cancelled') return undefined;
		if (outcome.action === 'enterIds') {
			const typed = await enterIds();
			if (typed) return options.canPickMany ? [...new Set([...state.selected.keys(), ...typed])] : typed.slice(0, 1);
			continue;
		}
		await runAction(outcome.action);
	}

	function showBrowser(): Promise<Outcome> {
		return new Promise(resolve => {
			const picker = vscode.window.createQuickPick<StoryItem>();
			let settled = false;
			let applyingItems = false;
			let searchTimer: ReturnType<typeof setTimeout> | undefined;
			let loadGeneration = 0;
			const finish = (outcome: Outcome) => {
				if (settled) return;
				settled = true;
				if (searchTimer) clearTimeout(searchTimer);
				resolve(outcome);
				picker.hide();
			};

			picker.title = browserTitle(options.title, state.mode, state.filters);
			picker.placeholder = state.mode === 'sprint'
				? `${options.placeholder} Type to narrow the list, search all Stories, or enter IDs from the buttons above.`
				: `${options.placeholder} Type an ID or part of a title, or enter IDs from the buttons above.`;
			picker.canSelectMany = options.canPickMany;
			picker.matchOnDescription = true;
			picker.buttons = buttonsFor(state.mode, state.filters, Boolean(options.sprintView));
			if (state.mode === 'search') picker.value = state.filters.text;

			const showStories = (stories: StorySummary[]) => {
				applyingItems = true;
				// Search results come from the server, so VS Code must not filter them again by the typed text.
				const items: StoryItem[] = withSelectedFirst(stories, state.selected).map(story => toItem(story, state.mode === 'search'));
				if (canLoadMore(stories.length, state.limit, STORY_SEARCH_MAX)) {
					items.push({ label: '$(chevron-down) Load more…', description: `Showing ${stories.length}`, alwaysShow: true, loadMore: true });
				}
				picker.items = items;
				if (options.canPickMany) picker.selectedItems = items.filter(item => item.story && state.selected.has(item.story.id));
				applyingItems = false;
			};

			const load = async () => {
				const generation = ++loadGeneration;
				picker.busy = true;
				try {
					const stories = state.mode === 'sprint'
						? await listSprintStories(options.adapter, { ...options.sprintView, limit: state.limit })
						: await searchStories(options.adapter, { ...toStorySearch(state.filters), limit: state.limit });
					if (generation === loadGeneration && !settled) showStories(stories);
				} catch (error) {
					if (generation === loadGeneration && !settled) {
						showStories([]);
						void vscode.window.showErrorMessage(`Atomize could not load Stories: ${error instanceof Error ? error.message : String(error)}`);
					}
				} finally {
					if (generation === loadGeneration) picker.busy = false;
				}
			};

			const loadMore = () => {
				state.limit = Math.min(state.limit + STORY_SEARCH_LIMIT, STORY_SEARCH_MAX);
				void load();
			};

			picker.onDidChangeValue(value => {
				if (state.mode !== 'search') return;
				state.filters.text = value;
				state.limit = STORY_SEARCH_LIMIT;
				if (searchTimer) clearTimeout(searchTimer);
				searchTimer = setTimeout(() => { void load(); }, SEARCH_DEBOUNCE_MS);
			});
			picker.onDidChangeSelection(items => {
				if (applyingItems || !options.canPickMany) return;
				// In a multi-select list "Load more…" is a checkbox; ticking it loads the next page instead.
				if (items.some(item => item.loadMore)) {
					loadMore();
					return;
				}
				for (const item of picker.items) if (item.story) state.selected.delete(item.story.id);
				for (const item of items) if (item.story) state.selected.set(item.story.id, item.story);
			});
			picker.onDidAccept(() => {
				const active = picker.activeItems[0];
				if (active?.loadMore) {
					loadMore();
					return;
				}
				if (options.canPickMany) {
					finish({ kind: 'done', ids: [...state.selected.keys()] });
					return;
				}
				const chosen = picker.selectedItems[0]?.story ?? active?.story;
				if (chosen) finish({ kind: 'done', ids: [chosen.id] });
			});
			picker.onDidTriggerButton(button => finish({ kind: 'action', action: (button as ActionButton).action }));
			picker.onDidHide(() => {
				finish({ kind: 'cancelled' });
				picker.dispose();
			});

			picker.show();
			void load();
		});
	}

	async function enterIds(): Promise<string[] | undefined> {
		const value = await vscode.window.showInputBox({
			title: `${options.title} — Enter Story IDs`,
			prompt: options.canPickMany ? 'Story IDs, separated by commas or spaces' : 'The Story ID',
			placeHolder: options.canPickMany ? '123, 456, 789' : '123',
			validateInput: (input): string | undefined => {
				const parsed = parseStoryIds(input);
				if ('error' in parsed) return parsed.error;
				if (!options.canPickMany && parsed.ids.length > 1) return 'Enter a single Story ID';
				return undefined;
			},
		});
		if (value === undefined) return undefined;
		const parsed = parseStoryIds(value);
		return 'ids' in parsed ? parsed.ids : undefined;
	}

	async function runAction(action: Exclude<Action, 'enterIds'>): Promise<void> {
		const filters = state.filters;
		state.limit = STORY_SEARCH_LIMIT;
		try {
			switch (action) {
				case 'switchMode':
					state.mode = state.mode === 'sprint' ? 'search' : 'sprint';
					return;
				case 'hasTasks':
					filters.hasTasks = !filters.hasTasks;
					return;
				case 'type':
					filters.workItemTypes = await pickMany('Work Item types', await metadata.types(), filters.workItemTypes) ?? filters.workItemTypes;
					return;
				case 'state':
					filters.states = await pickMany('States', await metadata.states(filters.workItemTypes), filters.states) ?? filters.states;
					return;
				case 'area':
					filters.areaPaths = await pickMany('Area paths (each includes its sub-areas)', await metadata.areaPaths(), filters.areaPaths) ?? filters.areaPaths;
					return;
				case 'iteration':
					filters.iterations = await pickMany('Iterations (each includes its sub-iterations)', await metadata.iterations(), filters.iterations) ?? filters.iterations;
					return;
			}
		} catch (error) {
			void vscode.window.showErrorMessage(`Atomize could not load filter choices: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	async function pickMany(title: string, choices: string[], current: string[]): Promise<string[] | undefined> {
		const picked = await vscode.window.showQuickPick(
			choices.map(choice => ({ label: choice, picked: current.includes(choice) })),
			{ title: `${options.title} — ${title}`, canPickMany: true, placeHolder: 'Select none to remove this filter' },
		);
		return picked?.map(item => item.label);
	}
}

/**
 * Resolves the profile's adapter and the Template's Work Item types that a Generate or Live Preview
 * Story Browser needs, or undefined when either fails — callers then fall back to their own flow,
 * whose error views explain the problem.
 */
export async function prepareTemplateStoryBrowser(
	credentialResolver: CredentialResolver,
	profile: string,
	fileUri: vscode.Uri,
): Promise<{ adapter: IPlatformAdapter; sprintView: { workItemTypes?: string[] } } | undefined> {
	try {
		const adapter = await credentialResolver.resolveByName(profile);
		const { template } = await createTemplateLibrary().loadSource(resolveDocumentPath(fileUri));
		return { adapter, sprintView: { workItemTypes: template.filter.workItemTypes } };
	} catch {
		return undefined;
	}
}

function toItem(story: StorySummary, alwaysShow: boolean): StoryItem {
	return { label: storyLabel(story), description: storyDescription(story), alwaysShow, story };
}

function buttonsFor(mode: StoryBrowserModeKind, filters: StoryBrowserFilters, hasSprintView: boolean): ActionButton[] {
	const buttons: ActionButton[] = [];
	if (hasSprintView) {
		buttons.push(mode === 'sprint'
			? { action: 'switchMode', iconPath: new vscode.ThemeIcon('search'), tooltip: 'Search all Stories' }
			: { action: 'switchMode', iconPath: new vscode.ThemeIcon('history'), tooltip: 'Back to the current and next sprint' });
	}
	buttons.push({ action: 'enterIds', iconPath: new vscode.ThemeIcon('edit'), tooltip: 'Enter Story IDs' });
	if (mode === 'search') {
		buttons.push(
			{ action: 'type', iconPath: new vscode.ThemeIcon('symbol-class'), tooltip: filterTooltip('Type', filters.workItemTypes) },
			{ action: 'state', iconPath: new vscode.ThemeIcon('pulse'), tooltip: filterTooltip('State', filters.states) },
			{ action: 'area', iconPath: new vscode.ThemeIcon('folder'), tooltip: filterTooltip('Area path', filters.areaPaths) },
			{ action: 'iteration', iconPath: new vscode.ThemeIcon('calendar'), tooltip: filterTooltip('Iteration', filters.iterations) },
			{
				action: 'hasTasks',
				iconPath: new vscode.ThemeIcon(filters.hasTasks ? 'pass-filled' : 'circle-large-outline'),
				tooltip: filters.hasTasks ? 'Has Tasks: on (only Stories that already have Tasks)' : 'Has Tasks: off (any Story)',
			},
		);
	}
	return buttons;
}

function filterTooltip(name: string, values: string[]): string {
	return values.length ? `${name}: ${values.join(', ')}` : `Filter by ${name.toLowerCase()}`;
}

/** Project metadata for the filter sub-pickers, fetched once per Story Browser. */
class ProjectChoices {
	private cache = new Map<string, Promise<string[]>>();

	constructor(private readonly adapter: IPlatformAdapter) {}

	types(): Promise<string[]> {
		return this.cached('types', () => requireProjectMetadataReader(this.adapter).getWorkItemTypes());
	}

	areaPaths(): Promise<string[]> {
		return this.cached('areas', () => requireProjectMetadataReader(this.adapter).getAreaPaths());
	}

	iterations(): Promise<string[]> {
		return this.cached('iterations', () => requireProjectMetadataReader(this.adapter).getIterationPaths());
	}

	/** States of the chosen types, or of every type when none is chosen. */
	async states(types: string[]): Promise<string[]> {
		const reader = requireProjectMetadataReader(this.adapter);
		const forTypes = types.length ? types : await this.types();
		const lists = await Promise.all(forTypes.map(type => this.cached(`states:${type}`, () => reader.getStatesForWorkItemType(type))));
		return [...new Set(lists.flat())].sort();
	}

	private cached(key: string, load: () => Promise<string[]>): Promise<string[]> {
		let entry = this.cache.get(key);
		if (!entry) {
			entry = load();
			entry.catch(() => this.cache.delete(key));
			this.cache.set(key, entry);
		}
		return entry;
	}
}
