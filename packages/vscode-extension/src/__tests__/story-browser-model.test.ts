import { describe, expect, it } from 'bun:test';
import type { StorySummary } from '@sppg2001/atomize-core/services/story-search';
import {
	browserTitle,
	canLoadMore,
	emptyFilters,
	filterTooltip,
	hasTasksTooltip,
	listStatus,
	parseStoryIds,
	storyDescription,
	storyLabel,
	switchModeTooltip,
	toStorySearch,
	withSelectedFirst,
} from '../stories/story-browser-model.js';

const story = (id: string, taskCount = 0): StorySummary => ({ id, title: `Story ${id}`, type: 'User Story', state: 'Active', taskCount });

describe('story browser model', () => {
	it('labels a Story with its ID and title, and describes its type, state, and Task count', () => {
		expect(storyLabel(story('123', 5))).toBe('#123 Story 123');
		expect(storyDescription(story('123', 5))).toBe('User Story · Active · 5 tasks');
		expect(storyDescription(story('123', 1))).toBe('User Story · Active · 1 task');
	});

	it('maps only the filters in effect to a Story Search', () => {
		expect(toStorySearch(emptyFilters(false))).toEqual({});
		expect(toStorySearch({ ...emptyFilters(true), text: '  login ', areaPaths: ['P\\Web'] }))
			.toEqual({ text: 'login', areaPaths: ['P\\Web'], hasTasks: true });
	});

	it('names the mode in the title and lists every Search filter in effect', () => {
		expect(browserTitle('Atomize: Generate', 'sprint', emptyFilters(false))).toBe('Atomize: Generate — Current and next sprint, no Tasks yet');
		expect(browserTitle('Atomize: Improve', 'applied', emptyFilters(true))).toBe('Atomize: Improve — Stories this Template was applied to');
		expect(browserTitle('Atomize: Generate', 'search', emptyFilters(false))).toBe('Atomize: Generate — Search');
		expect(browserTitle('Atomize: Generate', 'search', {
			...emptyFilters(true), workItemTypes: ['Bug'], states: ['Active'], areaPaths: ['P\\Team A'], iterations: ['P\\Sprint 3'],
		})).toBe('Atomize: Generate — Search (Type: Bug · State: Active · Area: Team A · Iteration: Sprint 3 · Has Tasks)');
	});

	it('keeps selected Stories listed first, without duplicating them in the results', () => {
		const selected = new Map([['2', story('2')]]);
		expect(withSelectedFirst([story('1'), story('2'), story('3')], selected).map(s => s.id)).toEqual(['2', '1', '3']);
	});

	it('offers Load more only when the last load filled its page and the maximum is not reached', () => {
		expect(canLoadMore(50, 50, 500)).toBe(true);
		expect(canLoadMore(37, 50, 500)).toBe(false);
		expect(canLoadMore(500, 500, 500)).toBe(false);
	});

	it('says in the title how much of the list is shown and where to load more', () => {
		expect(listStatus(50, 50, 500)).toBe(' · Showing 50, more with Load more (↓) above');
		expect(listStatus(37, 50, 500)).toBe('');
		expect(listStatus(500, 500, 500)).toBe(' · Showing the newest 500; narrow the search or enter IDs to reach older Stories');
	});

	it('parses typed Story IDs separated by commas or spaces, ignoring a leading # and duplicates', () => {
		expect(parseStoryIds('12, #34 56,12')).toEqual({ ids: ['12', '34', '56'] });
		expect(parseStoryIds('  ')).toEqual({ error: 'Enter at least one Story ID' });
		expect(parseStoryIds('12, abc')).toEqual({ error: 'IDs must be numeric. Invalid: abc' });
	});

	it('explains on hover what each filter button narrows to and what clicking it changes', () => {
		const filters = { ...emptyFilters(false), workItemTypes: ['Bug', 'User Story'] };
		expect(filterTooltip('type', filters)).toBe('Type: Bug, User Story — click to change which Work Item types to search, or select none to remove this filter');
		expect(filterTooltip('state', filters)).toBe('State: any — click to choose which States to search');
		expect(hasTasksTooltip(false)).toBe('Has Tasks: off, any Story — click to show only Stories that already have Tasks');
		expect(hasTasksTooltip(true)).toBe('Has Tasks: on, only Stories that already have Tasks — click to include every Story');
	});

	it('says where the mode button goes and that Search filters only apply in Search', () => {
		expect(switchModeTooltip('sprint', 'sprint')).toStartWith('Search all Stories');
		expect(switchModeTooltip('search', 'sprint')).toBe('Back to the current and next sprint (Stories with no Tasks yet) — your Search filters are kept but not applied');
		expect(switchModeTooltip('search', 'applied')).toBe('Back to Stories this Template was applied to — your Search filters are kept but not applied');
	});
});
