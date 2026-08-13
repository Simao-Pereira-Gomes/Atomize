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

function setupVscodeMock(panel: FakePanel, opts: { storyIdsInput?: string; confirm?: string } = {}): void {
	mock.module('vscode', () => ({
		...baseVscodeMock(),
		window: {
			createWebviewPanel: mock(() => ({
				...panel,
				onDidDispose: () => ({ dispose() {} }),
				reveal: () => {},
				dispose: () => {},
			})),
			showInputBox: mock(async () => opts.storyIdsInput ?? ''),
			showInformationMessage: mock(async () => opts.confirm ?? 'Create Tasks'),
		},
		workspace: {
			asRelativePath: (uri: { fsPath: string }) => uri.fsPath,
		},
		env: { openExternal: mock(() => undefined) },
		commands: { executeCommand: mock(() => undefined) },
	}));
}

function setupSupportMocks(): void {
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

		expect(htmlTitle(panel.webview.html)).toBe('Atomize: Generate');
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

		expect(htmlTitle(panel.webview.html)).toBe('Atomize: Generate — Auth Error');
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

		expect(htmlTitle(panel.webview.html)).toBe('Atomize: Generate — No Matches');
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
		await waitFor(() => htmlTitle(panel.webview.html) === 'Atomize: Generate — Done');

		expect(panel.messages).toEqual([
			{ type: 'liveProgress', storiesCompleted: 1, totalStories: 2, tasksCreated: 2 },
		]);
	});
});
