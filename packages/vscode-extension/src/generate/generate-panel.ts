import { basename } from 'node:path';
import { Atomizer } from '@sppg2001/atomize-core';
import { type AtomizationReport, DEFAULT_GENERATION_STALL_TIMEOUT_MS, type ProgressEvent } from '@sppg2001/atomize-core/core/atomizer';
import { AuthError } from '@sppg2001/atomize-core/utils/errors';
import * as vscode from 'vscode';
import { isAtomizeDocument } from '../authoring/language-detection.js';
import { resolveDocumentPath } from '../catalog/catalog-document-path.js';
import { getDefaultProfile, getPreviewLayout } from '../config/atomize-configuration.js';
import { createTemplateLibrary } from '../core-library.js';
import { authFailureDetail } from '../profiles/auth-failure.js';
import type { CredentialResolver } from '../profiles/credential-resolver.js';
import { pickProfile } from '../profiles/profile-picker.js';
import type { ProfileStore } from '../profiles/profile-store.js';
import { browseStories, prepareTemplateStoryBrowser, type StoryPick } from '../stories/story-browser.js';
import { parseStoryIds } from '../stories/story-browser-model.js';
import { type Ending, telemetry } from '../telemetry/extension-telemetry.js';
import type { GenerateReport } from './generate-html.js';
import {
	renderGenerateBlocked,
	renderGenerateDrySuccess,
	renderGenerateDryWarnings,
	renderGenerateLivePartial,
	renderGenerateLiveRunning,
	renderGenerateLiveStopped,
	renderGenerateLiveSuccess,
	renderGenerateLoading,
} from './generate-html.js';

interface SwitchModeMessage { type: 'switchMode'; mode: 'default' | 'compact'; }
interface CreateTasksMessage { type: 'createTasks'; continueOnError: boolean; }
interface ManageProfilesMessage { type: 'manageProfiles'; }
interface OpenLinkMessage { type: 'openLink'; url: string; }
/** Finish these Partly Created Stories: a resume dry run of them. */
interface FinishStoriesMessage { type: 'finishStories'; storyIds: string[]; }
/** Stop the live run: no new Story or Task starts, and the result shows what was done. */
interface CancelRunMessage { type: 'cancelRun'; }
/** Run the dry run again with the same profile, Stories, and Finish setting. */
interface RerunDryRunMessage { type: 'rerunDryRun'; }
type WebviewMessage = SwitchModeMessage | CreateTasksMessage | ManageProfilesMessage | OpenLinkMessage | FinishStoriesMessage | CancelRunMessage | RerunDryRunMessage;

type GenerateOutcome = { report: AtomizationReport } | { error: 'auth' | 'blocked'; detail: string };

function errorDetail(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

async function runAtomize(
	credentialResolver: CredentialResolver,
	profile: string,
	fileUri: vscode.Uri,
	options: { dryRun: boolean; continueOnError?: boolean; storyIds?: string[]; resume?: boolean; signal?: AbortSignal; onProgress?: (event: ProgressEvent) => void },
): Promise<GenerateOutcome> {
	const startedAt = Date.now();
	try {
		const adapter = await credentialResolver.resolveByName(profile);
		const { template } = await createTemplateLibrary().loadSource(resolveDocumentPath(fileUri));
		const atomizer = new Atomizer(adapter);
		const report = await atomizer.atomize(template, { ...options, stallTimeoutMs: DEFAULT_GENERATION_STALL_TIMEOUT_MS });
		reportGenerationRun(options, report, undefined, startedAt);
		return { report };
	} catch (err) {
		reportGenerationRun(options, undefined, err, startedAt);
		if (err instanceof AuthError) return { error: 'auth', detail: authFailureDetail(err) };
		return { error: 'blocked', detail: errorDetail(err) };
	}
}

const clampCount = (value: number): number => Math.max(0, Math.min(1_000_000, Math.trunc(value)));

/** Reports one Generation Run (a dry run or a live one) as it ends, with counts only. */
function reportGenerationRun(
	options: { dryRun: boolean; continueOnError?: boolean; resume?: boolean },
	report: AtomizationReport | undefined,
	error: unknown,
	startedAt: number,
): void {
	const props = {
		mode: options.dryRun ? 'dry-run' as const : 'execute' as const,
		output: 'human' as const,
		continueOnError: options.continueOnError === true,
		storyCount: clampCount(report?.storiesProcessed ?? 0),
		taskCount: clampCount((options.dryRun ? report?.tasksCalculated : report?.tasksCreated) ?? 0),
		failedStoryCount: clampCount(report?.storiesFailed ?? 0),
	};
	const ending: Ending = report
		? report.stopped
			? report.stopped.reason === 'timedOut' ? { outcome: 'failure', errorCategory: 'timeout' } : { outcome: 'cancelled' }
			: report.storiesFailed > 0 ? { outcome: 'failure' } : { outcome: 'success' }
		: { error };
	if (options.resume) telemetry.finished('generate.resume', props, ending, startedAt);
	else telemetry.finished('generate', props, ending, startedAt);
}

type GenerateScope = 'filter' | 'stories';
type ScopeItem = vscode.QuickPickItem & { scope: GenerateScope };

/** The scope chosen last in this VS Code session, offered first next time. */
let lastScope: GenerateScope = 'filter';

/** Asks whether to run on every Story the Template's filter matches or on Stories the user picks. */
function pickGenerateScope(): Promise<GenerateScope | undefined> {
	return new Promise(resolve => {
		const items: ScopeItem[] = [
			{ scope: 'filter', label: "$(filter) Use the Template's filter", detail: 'Dry run on every Story the Template matches.' },
			{ scope: 'stories', label: '$(checklist) Pick Stories…', detail: 'Choose Stories in the Story Browser, or finish ones a stopped run left partly created.' },
		];
		const picker = vscode.window.createQuickPick<ScopeItem>();
		picker.title = 'Atomize: Generate';
		picker.placeholder = 'Which Stories should this run use?';
		picker.items = items;
		picker.activeItems = items.filter(item => item.scope === lastScope);
		let settled = false;
		picker.onDidAccept(() => {
			const chosen = picker.activeItems[0]?.scope;
			if (!chosen) return;
			settled = true;
			lastScope = chosen;
			resolve(chosen);
			picker.hide();
		});
		picker.onDidHide(() => {
			if (!settled) resolve(undefined);
			picker.dispose();
		});
		picker.show();
	});
}

/** Typed Story IDs, when the Story Browser can't load; the dry run then reports why. */
async function enterGenerateStoryIds(): Promise<string[] | undefined> {
	const value = await vscode.window.showInputBox({
		title: 'Atomize: Generate',
		prompt: 'Story IDs, separated by commas or spaces',
		placeHolder: '123, 456',
		validateInput: (input): string | undefined => {
			const parsed = parseStoryIds(input);
			return 'error' in parsed ? parsed.error : undefined;
		},
	});
	if (value === undefined) return undefined;
	const parsed = parseStoryIds(value);
	return 'ids' in parsed ? parsed.ids : undefined;
}

/**
 * Asks for the run's scope: the Template's filter (no Story IDs), or at least one Story picked in
 * the Story Browser, whose Finish toggle makes the run a Resume. Resolves undefined when dismissed.
 */
async function pickGenerateStories(credentialResolver: CredentialResolver, profile: string, fileUri: vscode.Uri): Promise<StoryPick | undefined> {
	const scope = await pickGenerateScope();
	if (scope === undefined) return undefined;
	if (scope === 'filter') return { ids: [], resume: false };
	const source = await prepareTemplateStoryBrowser(credentialResolver, profile, fileUri);
	if (!source) {
		const ids = await enterGenerateStoryIds();
		return ids ? { ids, resume: false } : undefined;
	}
	return browseStories({
		...source,
		title: 'Atomize: Generate',
		canPickMany: true,
		requirePick: true,
		placeholder: 'Tick the Stories to generate for.',
		finish: { placeholder: 'Tick the Stories to finish: only the Tasks each one is missing are created.' },
	});
}

export class GeneratePanel {
	private static _instance: GeneratePanel | undefined;

	private _panel: vscode.WebviewPanel;
	private _fileUri: vscode.Uri;
	private _mode: 'default' | 'compact';
	private _profile: string;
	private _storyIds: string[] | undefined;
	private _dryRunReport: GenerateReport | undefined;
	private _execReport: GenerateReport | undefined;
	private _continueOnError: boolean = false;
	private _isExecuting: boolean = false;
	/** Finishing Partly Created Stories: only the Tasks each one is missing are created. */
	private _resume: boolean = false;
	/** Cancels the live run in progress, if any. */
	private _liveRun: AbortController | undefined;
	/**
	 * An Atomize file was saved after the dry run loaded the Template: the Template, or a Mixin it
	 * builds on, may have changed, so the plan shown may not be what Create would make.
	 */
	private _stale: boolean = false;

	private constructor(
		panel: vscode.WebviewPanel,
		fileUri: vscode.Uri,
		private readonly _credentialResolver: CredentialResolver,
		mode: 'default' | 'compact',
		profile: string,
		storyIds: string[] | undefined,
	) {
		this._panel = panel;
		this._fileUri = fileUri;
		this._mode = mode;
		this._profile = profile;
		this._storyIds = storyIds;

		const saves = vscode.workspace.onDidSaveTextDocument(doc => this._onDocumentSaved(doc));
		panel.onDidDispose(() => {
			saves.dispose();
			GeneratePanel._instance = undefined;
		});
		panel.webview.onDidReceiveMessage((msg: unknown) => { void this._handleMessage(msg); });
	}

	static async open(fileUri: vscode.Uri, store: ProfileStore, credentialResolver: CredentialResolver): Promise<void> {
		const mode = getPreviewLayout(fileUri);
		const defaultProfile = getDefaultProfile(fileUri);

		if (GeneratePanel._instance?._isExecuting) {
			GeneratePanel._instance._panel.reveal(vscode.ViewColumn.Beside, true);
			return;
		}

		const profile = await pickProfile(store, credentialResolver, { title: 'Atomize: Generate', allowOffline: false, defaultProfile });
		if (profile == null) return;

		const pick = await pickGenerateStories(credentialResolver, profile, fileUri);
		if (pick === undefined) return;
		// A resume finishes only the Stories named; there is no filter-wide resume.
		const resume = pick.resume;
		if (resume && pick.ids.length === 0) return;
		const storyIds = pick.ids.length > 0 ? pick.ids : undefined;

		const fileName = basename(fileUri.fsPath);

		let panel: GeneratePanel;
		if (GeneratePanel._instance) {
			const inst = GeneratePanel._instance;
			inst._fileUri = fileUri;
			inst._mode = mode;
			inst._profile = profile;
			inst._storyIds = storyIds;
			inst._dryRunReport = undefined;
			inst._execReport = undefined;
			inst._continueOnError = false;
			inst._resume = resume;
			inst._panel.title = `Atomize: ${fileName} (Generate · Dry Run)`;
			inst._panel.reveal(vscode.ViewColumn.Beside, true);
			panel = inst;
		} else {
			const webviewPanel = vscode.window.createWebviewPanel(
				'atomize.generate',
				`Atomize: ${fileName} (Generate · Dry Run)`,
				{ viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
				{ enableScripts: true, retainContextWhenHidden: true },
			);
			panel = new GeneratePanel(webviewPanel, fileUri, credentialResolver, mode, profile, storyIds);
			panel._resume = resume;
			GeneratePanel._instance = panel;
		}

		await panel._runDryRun();
	}

	private _onDocumentSaved(doc: vscode.TextDocument): void {
		if (doc.uri.toString() !== this._fileUri.toString() && !isAtomizeDocument(doc)) return;
		this._stale = true;
		// A dry run in progress shows its result as stale when it ends; a live run's result has no Create.
		if (!this._isExecuting && this._dryRunReport && !this._execReport) this._renderDryRun(this._dryRunReport);
	}

	/** The dry run's report with Create, or its warnings, in the current layout. */
	private _renderDryRun(report: GenerateReport): void {
		const fileName = basename(this._fileUri.fsPath);
		const options = { stale: this._stale };
		this._panel.webview.html = report.tasksSkipped > 0 || report.storiesFailed > 0
			? renderGenerateDryWarnings(report, this._mode, fileName, this._profile, this._storyIds, options)
			: renderGenerateDrySuccess(report, this._mode, fileName, this._profile, this._storyIds, options);
	}

	private async _runDryRun(): Promise<void> {
		this._isExecuting = true;
		// Saves from here on may or may not reach this run's Template load, so they still mark it stale.
		this._stale = false;
		try {
			const fileName = basename(this._fileUri.fsPath);
			this._panel.webview.html = renderGenerateLoading(fileName, this._profile, this._storyIds);

			const outcome = await runAtomize(this._credentialResolver, this._profile, this._fileUri, {
				dryRun: true,
				storyIds: this._storyIds,
				...(this._resume ? { resume: true } : {}),
			});

			if ('error' in outcome) {
				this._panel.webview.html = renderGenerateBlocked(
					outcome.error === 'auth' ? 'auth' : 'no-matches',
					outcome.error === 'auth' ? outcome.detail : (outcome.detail || 'Check that the template file is valid.'),
					fileName,
					this._profile,
					this._storyIds,
				);
				return;
			}

			const report = outcome.report as GenerateReport;
			this._dryRunReport = report;
			this._panel.title = `Atomize: ${fileName} (Generate)`;

			if (report.stopped) {
				this._panel.webview.html = renderGenerateBlocked('exec-error', report.stopped.message, fileName, this._profile, this._storyIds);
				return;
			}

			if (report.storiesProcessed === 0) {
				const partlyCreated = (report.partlyCreated ?? []).length > 0;
				const noMatchMsg = partlyCreated
					? 'Every matching Story already has Tasks, so excludeIfHasTasks skipped them all. The Stories below look partly created: finish them to create only their missing Tasks.'
					: this._storyIds
						? `None of the specified story IDs were found, or all were excluded by the template's excludeIfHasTasks filter. Verify the IDs are correct and accessible via the "${this._profile}" profile.`
						: 'The filter returned no work items. Check your YAML filter conditions and verify the profile has access to the configured project.';
				this._panel.webview.html = renderGenerateBlocked('no-matches', noMatchMsg, fileName, this._profile, this._storyIds, report);
				return;
			}

			if (report.tasksCalculated === 0 && this._resume) {
				this._panel.webview.html = renderGenerateBlocked(
					'no-tasks',
					'Every planned Task already exists on these Stories, so there is nothing to finish.',
					fileName,
					this._profile,
					this._storyIds,
				);
				return;
			}

			if (report.tasksCalculated === 0) {
				const n = report.storiesProcessed;
				this._panel.webview.html = renderGenerateBlocked(
					'no-tasks',
					`${n} ${n === 1 ? 'story' : 'stories'} matched but all tasks were filtered out by template conditions. Review your template conditions and re-run.`,
					fileName,
					this._profile,
					this._storyIds,
					report,
				);
				return;
			}

			this._renderDryRun(report);
		} finally {
			this._isExecuting = false;
		}
	}

	private async _runLive(): Promise<void> {
		const dryReport = this._dryRunReport;
		if (!dryReport) return;

		this._isExecuting = true;
		const liveRun = new AbortController();
		this._liveRun = liveRun;
		try {
			const fileName = basename(this._fileUri.fsPath);
			this._panel.title = `Atomize: ${fileName} (Generate · Creating…)`;
			this._panel.webview.html = renderGenerateLiveRunning(dryReport, fileName, this._profile, this._storyIds);

			const outcome = await runAtomize(this._credentialResolver, this._profile, this._fileUri, {
				dryRun: false,
				continueOnError: this._continueOnError,
				storyIds: previewedStoryIds(this._storyIds, dryReport),
				...(this._resume ? { resume: true } : {}),
				signal: liveRun.signal,
				onProgress: event => {
					if (event.type !== 'story_complete' && event.type !== 'story_error') return;
					this._panel.webview.postMessage({
						type: 'liveProgress',
						storiesCompleted: event.completedStories,
						totalStories: event.totalStories,
						tasksCreated: event.tasksCreated,
					});
				},
			});

			this._panel.title = `Atomize: ${fileName} (Generate · Done)`;

			if ('error' in outcome) {
				this._panel.webview.html = renderGenerateBlocked(
					outcome.error === 'auth' ? 'auth' : 'exec-error',
					outcome.error === 'auth' ? outcome.detail : (outcome.detail || 'Error during task creation.'),
					fileName,
					this._profile,
					this._storyIds,
				);
				return;
			}

			// A run on the Template's filter fetches only the previewed Stories live, so the partly
			// created ones its dry run found and skipped come from the dry run.
			const liveReport = outcome.report as GenerateReport;
			const execReport = (liveReport.partlyCreated ?? []).length > 0
				? liveReport
				: { ...liveReport, partlyCreated: dryReport.partlyCreated ?? [] };
			this._execReport = execReport;
			if (execReport.stopped) this._panel.title = `Atomize: ${fileName} (Generate · Stopped)`;
			this._panel.webview.html = this._renderLiveResult(dryReport, execReport, fileName);
		} finally {
			this._liveRun = undefined;
			this._isExecuting = false;
		}
	}

	private async _handleMessage(msg: unknown): Promise<void> {
		if (typeof msg !== 'object' || msg === null) return;
		const message = msg as WebviewMessage;

		if (message.type === 'switchMode') {
			this._mode = message.mode;
			const fileName = basename(this._fileUri.fsPath);

			// Live phase: re-render live result
			if (this._execReport && this._dryRunReport) {
				this._panel.webview.html = this._renderLiveResult(this._dryRunReport, this._execReport, fileName);
				return;
			}

			// Dry-run phase: re-render dry result
			if (this._dryRunReport) this._renderDryRun(this._dryRunReport);
		} else if (message.type === 'createTasks') {
			const report = this._dryRunReport;
			if (!report || report.storiesFailed > 0 || report.tasksCalculated === 0 || this._stale || this._isExecuting) return;

			this._continueOnError = message.continueOnError;

			const nTasks = report.tasksCalculated;
			const nStories = report.storiesSuccess;
			const coeNote = this._continueOnError ? '\n\nContinue on task failure is enabled: if a task fails to create, remaining tasks will still be attempted.' : '';

			const confirmed = await vscode.window.showInformationMessage(
				`Create ${nTasks} task${nTasks === 1 ? '' : 's'} for ${nStories} ${nStories === 1 ? 'story' : 'stories'} using profile "${this._profile}"?${coeNote}`,
				{ modal: true },
				'Create Tasks',
			);

			if (confirmed !== 'Create Tasks') return;
			// Saved while the dialog was open: the plan confirmed is no longer the one Create would make.
			if (this._stale) return;
			await this._runLive();
		} else if (message.type === 'cancelRun') {
			this._liveRun?.abort();
		} else if (message.type === 'rerunDryRun') {
			if (this._isExecuting) return;
			this._dryRunReport = undefined;
			this._execReport = undefined;
			this._continueOnError = false;
			await this._runDryRun();
		} else if (message.type === 'finishStories') {
			if (this._isExecuting || !Array.isArray(message.storyIds) || message.storyIds.length === 0) return;
			this._storyIds = message.storyIds.filter((id): id is string => typeof id === 'string');
			this._resume = true;
			this._dryRunReport = undefined;
			this._execReport = undefined;
			this._continueOnError = false;
			await this._runDryRun();
		} else if (message.type === 'manageProfiles') {
			await vscode.commands.executeCommand('atomize.manageProfiles');
		} else if (message.type === 'openLink') {
			await vscode.env.openExternal(vscode.Uri.parse(message.url));
		}
	}

	private _renderLiveResult(dryReport: GenerateReport, execReport: GenerateReport, fileName: string): string {
		if (execReport.stopped) return renderGenerateLiveStopped(dryReport, execReport, this._mode, fileName, this._profile, this._storyIds);
		if (execReport.storiesFailed > 0) return renderGenerateLivePartial(dryReport, execReport, this._mode, fileName, this._profile, this._storyIds);
		return renderGenerateLiveSuccess(dryReport, execReport, this._mode, fileName, this._profile, this._storyIds);
	}

	static dispose(): void {
		GeneratePanel._instance?._panel.dispose();
	}
}

/**
 * The Stories a live run creates Tasks for: the ones picked, or, for a run on the Template's filter,
 * exactly the Stories the dry run previewed. Querying the filter again could match Stories nobody
 * previewed.
 */
export function previewedStoryIds(picked: string[] | undefined, dryReport: GenerateReport): string[] | undefined {
	if (picked && picked.length > 0) return picked;
	return dryReport.results.map(result => result.story.id);
}
