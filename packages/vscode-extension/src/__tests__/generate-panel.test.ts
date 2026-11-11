import { afterEach, describe, expect, it, mock } from 'bun:test';
import * as realAtomizeCore from '@sppg2001/atomize-core';
import { AuthError } from '@sppg2001/atomize-core/utils/errors';
import { baseVscodeMock } from './vscode-test-helpers.js';

function mockAtomizeCore(overrides: { Atomizer?: unknown }): void {
	mock.module('@sppg2001/atomize-core', () => ({ ...realAtomizeCore, ...overrides }));
}

function mockTemplateLibrary(): void {
	mock.module('../core-library.js', () => ({
		createTemplateLibrary: () => ({ async loadSource() { return { template: {} }; } }),
	}));
}

// Date.now() has millisecond resolution and these tests run well under 1ms apart,
// so a plain counter is needed to force a fresh module (and fresh GeneratePanel
// singleton) on every dynamic import.
let importCounter = 0;

function makeReport(overrides?: Record<string, unknown>) {
	return {
		templateName: 'default',
		storiesProcessed: 2,
		storiesSuccess: 2,
		storiesFailed: 0,
		tasksCalculated: 4,
		tasksCreated: 4,
		tasksSkipped: 0,
		dryRun: true,
		results: [],
		errors: [],
		warnings: [],
		executionTime: 1000,
		...overrides,
	};
}

interface FakePanel {
	title: string;
	webview: {
		html: string;
		postMessage: (msg: unknown) => Promise<boolean>;
		onDidReceiveMessage: (cb: (msg: unknown) => void) => { dispose(): void };
	};
	messages: unknown[];
	receive: ((msg: unknown) => void) | undefined;
}

function createFakePanel(): FakePanel {
	const panel: FakePanel = {
		title: '',
		messages: [],
		receive: undefined,
		webview: {
			html: '',
			postMessage: (msg: unknown) => { panel.messages.push(msg); return Promise.resolve(true); },
			onDidReceiveMessage: (cb: (msg: unknown) => void) => { panel.receive = cb; return { dispose() {} }; },
		},
	};
	return panel;
}

function setupVscodeMock(panel: FakePanel, opts: { confirm?: string } = {}): void {
	mock.module('vscode', () => ({
		...baseVscodeMock(),
		window: {
			createWebviewPanel: mock(() => ({
				...panel,
				onDidDispose: () => ({ dispose() {} }),
				reveal: () => {},
				dispose: () => {},
			})),
			showInformationMessage: mock(async () => opts.confirm ?? 'Create Tasks'),
		},
		workspace: {
			asRelativePath: (uri: { fsPath: string }) => uri.fsPath,
		},
		env: { openExternal: mock(() => undefined) },
		commands: { executeCommand: mock(() => undefined) },
	}));
}

/** What the panel last asked the Story Browser for. */
let lastBrowse: { prepare?: unknown; browse?: Record<string, unknown> } = {};

function setupSupportMocks(opts: { pickedStoryIds?: string[] } = {}): void {
	lastBrowse = {};
	mock.module('../stories/story-browser.js', () => ({
		prepareTemplateStoryBrowser: async (_resolver: unknown, _profile: unknown, _uri: unknown, prepareOptions?: unknown) => {
			lastBrowse.prepare = prepareOptions;
			return { adapter: {}, defaultView: { kind: 'sprint' } };
		},
		browseStories: async (options: Record<string, unknown>) => { lastBrowse.browse = options; return opts.pickedStoryIds ?? []; },
	}));
	mock.module('../config/atomize-configuration.js', () => ({
		getDefaultProfile: () => undefined,
		getPreviewLayout: () => 'default',
	}));
	mock.module('../profiles/profile-picker.js', () => ({
		pickProfile: async () => 'work',
	}));
}

async function waitFor(check: () => boolean, timeoutMs = 2000): Promise<void> {
	const start = Date.now();
	while (!check()) {
		if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for condition');
		await new Promise(resolve => setTimeout(resolve, 5));
	}
}

function htmlTitle(html: string): string {
	return /<title>(.*?)<\/title>/.exec(html)?.[1] ?? '';
}

const fakeCredentialResolver = { resolveByName: async () => ({}) };
const fakeStore = { list: () => [] };

describe('GeneratePanel', () => {
	afterEach(() => {
		mock.restore();
	});

	it('renders the dry-run success state when Atomizer returns a clean report', async () => {
		const panel = createFakePanel();
		setupVscodeMock(panel);
		setupSupportMocks();
		mockTemplateLibrary();
		mockAtomizeCore({
			Atomizer: class {
				async atomize() { return makeReport(); }
			},
		});

		const { GeneratePanel } = await import(`../generate/generate-panel.js?t=${importCounter++}`);
		await GeneratePanel.open({ fsPath: '/tmp/a.atomize.yaml' }, fakeStore, fakeCredentialResolver);

		const vscode = await import('vscode');
		expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
			'atomize.generate', 'Atomize: a.atomize.yaml (Generate · Dry Run)', expect.anything(), expect.anything(),
		);
		expect(panel.webview.html).not.toContain('/tmp/a.atomize.yaml');
		expect(htmlTitle(panel.webview.html)).toBe('Atomize: Generate');
	});

	it('scopes the run to the Stories picked in the Story Browser', async () => {
		const panel = createFakePanel();
		setupVscodeMock(panel);
		setupSupportMocks({ pickedStoryIds: ['12', '34'] });
		mockTemplateLibrary();
		const received: unknown[] = [];
		mockAtomizeCore({
			Atomizer: class {
				async atomize(_template: unknown, options: { storyIds?: string[] }) { received.push(options.storyIds); return makeReport(); }
			},
		});

		const { GeneratePanel } = await import(`../generate/generate-panel.js?t=${importCounter++}`);
		await GeneratePanel.open({ fsPath: '/tmp/a.atomize.yaml' }, fakeStore, fakeCredentialResolver);

		expect(received).toEqual([['12', '34']]);
	});

	it("uses the Template's filter when no Stories are picked", async () => {
		const panel = createFakePanel();
		setupVscodeMock(panel);
		setupSupportMocks({ pickedStoryIds: [] });
		mockTemplateLibrary();
		const received: unknown[] = [];
		mockAtomizeCore({
			Atomizer: class {
				async atomize(_template: unknown, options: { storyIds?: string[] }) { received.push(options.storyIds); return makeReport(); }
			},
		});

		const { GeneratePanel } = await import(`../generate/generate-panel.js?t=${importCounter++}`);
		await GeneratePanel.open({ fsPath: '/tmp/a.atomize.yaml' }, fakeStore, fakeCredentialResolver);

		expect(received).toEqual([undefined]);
	});

	it('renders an auth-error blocked state when Atomizer throws AuthError', async () => {
		const panel = createFakePanel();
		setupVscodeMock(panel);
		setupSupportMocks();
		mockTemplateLibrary();
		mockAtomizeCore({
			Atomizer: class {
				async atomize() { throw new AuthError('Authentication failed: token expired', 'azure-devops'); }
			},
		});

		const { GeneratePanel } = await import(`../generate/generate-panel.js?t=${importCounter++}`);
		await GeneratePanel.open({ fsPath: '/tmp/a.atomize.yaml' }, fakeStore, fakeCredentialResolver);

		expect(htmlTitle(panel.webview.html)).toBe('Atomize: Generate · Auth Error');
		expect(panel.webview.html).toContain('token expired');
	});

	it('renders a no-matches blocked state when no stories are found', async () => {
		const panel = createFakePanel();
		setupVscodeMock(panel);
		setupSupportMocks();
		mockTemplateLibrary();
		mockAtomizeCore({
			Atomizer: class {
				async atomize() { return makeReport({ storiesProcessed: 0, storiesSuccess: 0, tasksCalculated: 0 }); }
			},
		});

		const { GeneratePanel } = await import(`../generate/generate-panel.js?t=${importCounter++}`);
		await GeneratePanel.open({ fsPath: '/tmp/a.atomize.yaml' }, fakeStore, fakeCredentialResolver);

		expect(htmlTitle(panel.webview.html)).toBe('Atomize: Generate · No Matches');
	});

	it('forwards story_complete progress events to the webview during a live run', async () => {
		const panel = createFakePanel();
		setupVscodeMock(panel);
		setupSupportMocks();
		mockTemplateLibrary();
		mockAtomizeCore({
			Atomizer: class {
				async atomize(_template: unknown, options: { dryRun: boolean; onProgress?: (e: unknown) => void }) {
					if (options.dryRun) return makeReport();
					options.onProgress?.({ type: 'story_complete', completedStories: 1, totalStories: 2, tasksCreated: 2 });
					options.onProgress?.({ type: 'query_start' }); // should be ignored
					return makeReport({ dryRun: false, storiesFailed: 0 });
				}
			},
		});

		const { GeneratePanel } = await import(`../generate/generate-panel.js?t=${importCounter++}`);
		await GeneratePanel.open({ fsPath: '/tmp/a.atomize.yaml' }, fakeStore, fakeCredentialResolver);
		expect(htmlTitle(panel.webview.html)).toBe('Atomize: Generate');

		panel.receive?.({ type: 'createTasks', continueOnError: false });
		await waitFor(() => htmlTitle(panel.webview.html) === 'Atomize: Generate · Done');

		expect(panel.messages).toEqual([
			{ type: 'liveProgress', storiesCompleted: 1, totalStories: 2, tasksCreated: 2 },
		]);
	});
});

// ─── Partly Created Stories (#331) ──────────────────────────────────────────

describe('GeneratePanel and Partly Created Stories', () => {
	afterEach(() => {
		mock.restore();
	});

	const story = (id: string) => ({ id, title: `Story ${id}` });
	const task = (title: string) => ({ title, estimation: 1 });

	async function openPanel(reports: unknown[], opts: { pickedStoryIds?: string[]; resume?: boolean } = {}) {
		const panel = createFakePanel();
		setupVscodeMock(panel);
		setupSupportMocks({ pickedStoryIds: opts.pickedStoryIds });
		mockTemplateLibrary();
		const calls: Array<{ dryRun?: boolean; storyIds?: string[]; resume?: boolean }> = [];
		mockAtomizeCore({
			Atomizer: class {
				async atomize(_template: unknown, options: { dryRun?: boolean; storyIds?: string[]; resume?: boolean }) {
					calls.push({ dryRun: options.dryRun, storyIds: options.storyIds, resume: options.resume });
					return reports[Math.min(calls.length - 1, reports.length - 1)];
				}
			},
		});
		const { GeneratePanel } = await import(`../generate/generate-panel.js?t=${importCounter++}`);
		await GeneratePanel.open({ fsPath: '/tmp/a.atomize.yaml' }, fakeStore, fakeCredentialResolver, opts.resume ? { resume: true } : undefined);
		return { panel, calls };
	}

	const dryReport = makeReport({
		results: [{ story: story('1'), tasksCalculated: [task('A'), task('B'), task('C')], tasksCreated: [], success: true }],
		tasksCalculated: 3,
		partlyCreated: [],
	});

	it('after a cancelled run, lists the Stories it stopped part-way through and offers to finish them', async () => {
		const stopped = makeReport({
			dryRun: false,
			results: [{ story: story('1'), tasksCalculated: [task('A'), task('B'), task('C')], tasksCreated: [{ id: 'T1', title: 'A' }], success: true, stoppedEarly: true }],
			stopped: { reason: 'timedOut', message: 'Generation timed out: no progress for 6 min.', storiesNotStarted: ['2'] },
			partlyCreated: [],
		});
		const { panel, calls } = await openPanel([dryReport, stopped, dryReport]);

		panel.receive?.({ type: 'createTasks', continueOnError: false });
		await waitFor(() => panel.webview.html.includes('Generation timed out'));

		expect(htmlTitle(panel.webview.html)).toBe('Atomize: Generate · Stopped');
		expect(panel.webview.html).toContain('1 of 3 Tasks created');
		// One list, one button: a Resume of a Story with no Tasks creates all of them.
		expect(panel.webview.html).toContain('<input type="checkbox" checked data-story="1">');
		expect(panel.webview.html).toContain('<input type="checkbox" checked data-story="2">');
		expect(panel.webview.html).toContain('2: not started');
		expect(panel.webview.html).not.toContain('Run it now');

		panel.receive?.({ type: 'finishStories', storyIds: ['1'] });
		await waitFor(() => calls.length === 3);
		expect(calls[2]).toEqual({ dryRun: true, storyIds: ['1'], resume: true });
	});

	it('a dry run offers to include the partly created Stories excludeIfHasTasks skipped in the same run', async () => {
		const { panel, calls } = await openPanel([{ ...dryReport, partlyCreated: [{ storyId: '7', title: 'Login', tasksExisting: 2, tasksPlanned: 6 }] }, dryReport]);

		expect(panel.webview.html).toContain('2 of 6 planned Tasks exist');
		expect(panel.webview.html).toContain('<input type="checkbox" data-story="7">');
		expect(panel.webview.html).toContain('data-base="1"');
		expect(panel.webview.html).toContain('Include in this run');

		// The webview sends the previewed Stories plus the ticked ones.
		panel.receive?.({ type: 'finishStories', storyIds: ['1', '7'] });
		await waitFor(() => calls.length === 2);
		expect(calls[1]).toEqual({ dryRun: true, storyIds: ['1', '7'], resume: true });
	});

	it('opened to finish Stories, resumes the picked ones and shows what already exists', async () => {
		const resumed = makeReport({
			results: [{
				story: story('1'), tasksCalculated: [task('B')], tasksCreated: [], success: true,
				resume: { existing: [{ title: 'A', workItemId: 'E1' }], notInPlan: [{ title: 'Spike', workItemId: 'E9' }], complete: false },
			}],
			tasksCalculated: 1,
			partlyCreated: [],
		});
		const { panel, calls } = await openPanel([resumed], { pickedStoryIds: ['1'], resume: true });

		expect(calls).toEqual([{ dryRun: true, storyIds: ['1'], resume: true }]);
		expect(panel.webview.html).toContain('Exists · #E1');  // no link: the child had no url
		expect(panel.webview.html).toContain('Not in the plan');
	});

	it('lets each partly created Story be ticked or unticked before finishing, when nothing else was previewed', async () => {
		const { panel } = await openPanel([{
			...dryReport,
			storiesProcessed: 0, storiesSuccess: 0, tasksCalculated: 0, results: [],
			partlyCreated: [
				{ storyId: '7', title: 'Login', tasksExisting: 2, tasksPlanned: 6 },
				{ storyId: '8', title: 'Logout', tasksExisting: 1, tasksPlanned: 6 },
			],
		}]);

		expect(panel.webview.html).toContain('<input type="checkbox" checked data-story="7">');
		expect(panel.webview.html).toContain('<input type="checkbox" checked data-story="8">');
		expect(panel.webview.html).toContain('Finish selected Stories');
	});

	it('the report after a live run still lists the partly created Stories excludeIfHasTasks skipped', async () => {
		const created = makeReport({
			dryRun: false,
			results: [{ story: story('1'), tasksCalculated: [task('A')], tasksCreated: [{ id: 'T1', title: 'A' }], success: true }],
			partlyCreated: [{ storyId: '7', title: 'Login', tasksExisting: 2, tasksPlanned: 6 }],
		});
		const { panel } = await openPanel([dryReport, created]);

		panel.receive?.({ type: 'createTasks', continueOnError: false });
		await waitFor(() => htmlTitle(panel.webview.html) === 'Atomize: Generate · Done');

		expect(panel.webview.html).toContain('2 of 6 planned Tasks exist');
		expect(panel.webview.html).toContain('data-story="7"');
	});

	it('opened to finish Stories, lists Stories with or without Tasks to pick from', async () => {
		await openPanel([dryReport], { pickedStoryIds: ['1'], resume: true });

		expect(lastBrowse.prepare).toEqual({ withTasks: true });
	});

	it('opened to generate, lists Stories without Tasks as before', async () => {
		await openPanel([dryReport], { pickedStoryIds: ['1'] });

		expect(lastBrowse.prepare).toEqual({ withTasks: false });
	});

	it('links each existing Task and child not in the plan to its Work Item, to check it is the right one', async () => {
		const resumed = makeReport({
			results: [{
				story: story('1'), tasksCalculated: [task('B')], tasksCreated: [], success: true,
				resume: {
					existing: [{ title: 'A', workItemId: 'E1', url: 'https://dev.azure.com/org/P/_workitems/edit/E1' }],
					notInPlan: [{ title: 'Spike', workItemId: 'E9', url: 'https://dev.azure.com/org/P/_workitems/edit/E9' }],
					complete: false,
				},
			}],
			tasksCalculated: 1,
			partlyCreated: [],
		});
		const { panel } = await openPanel([resumed], { pickedStoryIds: ['1'], resume: true });

		expect(panel.webview.html).toContain('data-url="https://dev.azure.com/org/P/_workitems/edit/E1"');
		expect(panel.webview.html).toContain('data-url="https://dev.azure.com/org/P/_workitems/edit/E9"');
	});

	it('opened to finish Stories, does nothing when no Story is picked', async () => {
		const { calls } = await openPanel([dryReport], { pickedStoryIds: [], resume: true });

		expect(calls).toEqual([]);
	});

	it('lists partly created Stories even when excludeIfHasTasks skipped every Story', async () => {
		const allSkipped = makeReport({
			storiesProcessed: 0, storiesSuccess: 0, tasksCalculated: 0, results: [],
			partlyCreated: [{ storyId: '7', title: 'Login', tasksExisting: 2, tasksPlanned: 6 }],
		});
		const { panel } = await openPanel([allSkipped]);

		expect(panel.webview.html).toContain('2 of 6 planned Tasks exist');
		expect(panel.webview.html).toContain('data-finish="7"');
	});

	it('a live run can be cancelled: no new work starts, and the result lists what stopped part-way', async () => {
		let signal: AbortSignal | undefined;
		const panel = createFakePanel();
		setupVscodeMock(panel);
		setupSupportMocks();
		mockTemplateLibrary();
		const stopped = makeReport({
			dryRun: false,
			results: [{ story: story('1'), tasksCalculated: [task('A'), task('B')], tasksCreated: [{ id: 'T1', title: 'A' }], success: true, stoppedEarly: true }],
			stopped: { reason: 'cancelled', message: 'The run was cancelled.', storiesNotStarted: [] },
			partlyCreated: [],
		});
		mockAtomizeCore({
			Atomizer: class {
				async atomize(_template: unknown, options: { dryRun?: boolean; signal?: AbortSignal }) {
					if (options.dryRun) return dryReport;
					signal = options.signal;
					await new Promise((resolve) => options.signal?.addEventListener('abort', resolve));
					return stopped;
				}
			},
		});
		const { GeneratePanel } = await import(`../generate/generate-panel.js?t=${importCounter++}`);
		await GeneratePanel.open({ fsPath: '/tmp/a.atomize.yaml' }, fakeStore, fakeCredentialResolver);

		panel.receive?.({ type: 'createTasks', continueOnError: false });
		await waitFor(() => signal !== undefined);
		expect(panel.webview.html).toContain('id="btn-cancel-run"');

		panel.receive?.({ type: 'cancelRun' });
		await waitFor(() => htmlTitle(panel.webview.html) === 'Atomize: Generate · Stopped');
		expect(signal?.aborted).toBe(true);
		expect(panel.webview.html).toContain('Run cancelled');
		expect(panel.webview.html).toContain('1 of 2 Tasks created');
	});

	it('says so when every planned Task of the resumed Stories already exists', async () => {
		const complete = makeReport({
			results: [{ story: story('1'), tasksCalculated: [], tasksCreated: [], success: true, resume: { existing: [{ title: 'A', workItemId: 'E1' }], notInPlan: [], complete: true } }],
			tasksCalculated: 0,
			partlyCreated: [],
		});
		const { panel } = await openPanel([complete], { pickedStoryIds: ['1'], resume: true });

		expect(panel.webview.html).toContain('Every planned Task already exists');
	});
});
