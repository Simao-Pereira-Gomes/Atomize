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
	if (mode === 'sprint') return `${base} — Current and next sprint, no Tasks yet`;
	if (mode === 'applied') return `${base} — Stories this Template was applied to`;
	const parts = [
		filters.workItemTypes.length ? `Type: ${filters.workItemTypes.join(', ')}` : '',
		filters.states.length ? `State: ${filters.states.join(', ')}` : '',
		filters.areaPaths.length ? `Area: ${filters.areaPaths.map(lastSegment).join(', ')}` : '',
		filters.iterations.length ? `Iteration: ${filters.iterations.map(lastSegment).join(', ')}` : '',
		filters.hasTasks ? 'Has Tasks' : '',
	].filter(Boolean);
	return parts.length ? `${base} — Search (${parts.join(' · ')})` : `${base} — Search`;
}

/** Merges the current page of results with Stories already selected, selected first and without duplicates. */
export function withSelectedFirst(results: StorySummary[], selected: Map<string, StorySummary>): StorySummary[] {
	return [...selected.values(), ...results.filter(story => !selected.has(story.id))];
}

/** Whether another page could exist: the last load filled its limit and the maximum isn't reached. */
export function canLoadMore(loaded: number, limit: number, max: number): boolean {
	return loaded >= limit && limit < max;
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
