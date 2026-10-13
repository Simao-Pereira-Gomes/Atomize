import type { StorySearch } from '@sppg2001/atomize-core/platforms/interfaces/story-search.interface';
import type { StorySummary } from '@sppg2001/atomize-core/services/story-search';

/** The Story Search narrowing a user has chosen in the Story Browser. */
export interface StoryBrowserFilters {
	text: string;
	workItemTypes: string[];
	states: string[];
	areaPaths: string[];
	iterations: string[];
	hasTasks: boolean;
}

/**
 * `sprint`: the default view for generation; `applied`: Stories a Template was applied to, for
 * Story Grounding; `search`: a Story Search across the project.
 */
export type StoryBrowserModeKind = 'sprint' | 'applied' | 'search';

export function emptyFilters(hasTasks: boolean): StoryBrowserFilters {
	return { text: '', workItemTypes: [], states: [], areaPaths: [], iterations: [], hasTasks };
}

export function toStorySearch(filters: StoryBrowserFilters): Omit<StorySearch, 'limit'> {
	return {
		...(filters.text.trim() ? { text: filters.text.trim() } : {}),
		...(filters.workItemTypes.length ? { workItemTypes: filters.workItemTypes } : {}),
		...(filters.states.length ? { states: filters.states } : {}),
		...(filters.areaPaths.length ? { areaPaths: filters.areaPaths } : {}),
		...(filters.iterations.length ? { iterations: filters.iterations } : {}),
		...(filters.hasTasks ? { hasTasks: true } : {}),
	};
}

export function storyLabel(story: StorySummary): string {
	return `#${story.id} ${story.title}`;
}

export function storyDescription(story: StorySummary): string {
	const tasks = `${story.taskCount} ${story.taskCount === 1 ? 'task' : 'tasks'}`;
	return [story.type, story.state, tasks].filter(Boolean).join(' · ');
}

/** The QuickPick title: which mode is active and, in Search mode, every filter in effect. */
export function browserTitle(base: string, mode: StoryBrowserModeKind, filters: StoryBrowserFilters): string {
	if (mode === 'sprint') return `${base} · Current and next sprint, no Tasks yet`;
	if (mode === 'applied') return `${base} · Stories this Template was applied to`;
	const parts = [
		filters.workItemTypes.length ? `Type: ${filters.workItemTypes.join(', ')}` : '',
		filters.states.length ? `State: ${filters.states.join(', ')}` : '',
		filters.areaPaths.length ? `Area: ${filters.areaPaths.map(lastSegment).join(', ')}` : '',
		filters.iterations.length ? `Iteration: ${filters.iterations.map(lastSegment).join(', ')}` : '',
		filters.hasTasks ? 'Has Tasks' : '',
	].filter(Boolean);
	return parts.length ? `${base} · Search (${parts.join(' · ')})` : `${base} · Search`;
}

export type StoryBrowserFilterKind = 'type' | 'state' | 'area' | 'iteration';

const FILTER_TOOLTIPS: Record<StoryBrowserFilterKind, { name: string; field: (filters: StoryBrowserFilters) => string[]; choose: string }> = {
	type: { name: 'Type', field: f => f.workItemTypes, choose: 'which Work Item types to search' },
	state: { name: 'State', field: f => f.states, choose: 'which States to search' },
	area: { name: 'Area path', field: f => f.areaPaths, choose: 'area paths to search (each includes its sub-areas)' },
	iteration: { name: 'Iteration', field: f => f.iterations, choose: 'iterations to search (each includes its sub-iterations)' },
};

/** A filter button's hover text: what the filter currently narrows to and what clicking it changes. */
export function filterTooltip(kind: StoryBrowserFilterKind, filters: StoryBrowserFilters): string {
	const { name, field, choose } = FILTER_TOOLTIPS[kind];
	const values = field(filters);
	return values.length
		? `${name}: ${values.join(', ')}. Click to change ${choose}, or select none to remove this filter`
		: `${name}: any. Click to choose ${choose}`;
}

/** The Has Tasks button's hover text: its current setting and what clicking it switches to. */
export function hasTasksTooltip(hasTasks: boolean): string {
	return hasTasks
		? 'Has Tasks: on, only Stories that already have Tasks. Click to include every Story'
		: 'Has Tasks: off, any Story. Click to show only Stories that already have Tasks';
}

/** The mode button's hover text: which list clicking it switches to and whether the Search filters apply there. */
export function switchModeTooltip(mode: StoryBrowserModeKind, defaultView: 'sprint' | 'applied'): string {
	if (mode !== 'search') return 'Search all Stories: type to search and narrow with the Type, State, Area, Iteration, and Has Tasks filters';
	return defaultView === 'sprint'
		? 'Back to the current and next sprint (Stories with no Tasks yet). Your Search filters are kept but not applied'
		: 'Back to Stories this Template was applied to. Your Search filters are kept but not applied';
}

/** Merges the current page of results with Stories already selected, selected first and without duplicates. */
export function withSelectedFirst(results: StorySummary[], selected: Map<string, StorySummary>): StorySummary[] {
	return [...selected.values(), ...results.filter(story => !selected.has(story.id))];
}

/** Whether another page could exist: the last load filled its limit and the maximum isn't reached. */
export function canLoadMore(loaded: number, limit: number, max: number): boolean {
	return loaded >= limit && limit < max;
}

/**
 * Title suffix saying how much of the list is shown: that more can be loaded with the title-bar
 * button, or that the maximum is reached and older Stories need a narrower search.
 */
export function listStatus(loaded: number, limit: number, max: number): string {
	if (canLoadMore(loaded, limit, max)) return ` · Showing ${loaded}, more with Load more (↓) above`;
	if (loaded >= max) return ` · Showing the newest ${max}; narrow the search or enter IDs to reach older Stories`;
	return '';
}

/** Splits typed Story IDs on commas and whitespace; returns an error message when any isn't numeric. */
export function parseStoryIds(input: string): { ids: string[] } | { error: string } {
	const ids = [...new Set(input.split(/[\s,]+/).map(part => part.replace(/^#/, '')).filter(Boolean))];
	if (ids.length === 0) return { error: 'Enter at least one Story ID' };
	const invalid = ids.filter(id => !/^\d+$/.test(id));
	return invalid.length > 0 ? { error: `IDs must be numeric. Invalid: ${invalid.join(', ')}` } : { ids };
}

function lastSegment(path: string): string {
	return path.split('\\').pop() || path;
}
