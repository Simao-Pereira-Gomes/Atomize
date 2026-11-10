import { basename } from 'node:path';
import { Atomizer } from '@sppg2001/atomize-core';
import { type AtomizationReport, DEFAULT_GENERATION_STALL_TIMEOUT_MS, type ProgressEvent } from '@sppg2001/atomize-core/core/atomizer';
import { AuthError } from '@sppg2001/atomize-core/utils/errors';
import * as vscode from 'vscode';
import { resolveDocumentPath } from '../catalog/catalog-document-path.js';
import { getDefaultProfile, getPreviewLayout } from '../config/atomize-configuration.js';
import { createTemplateLibrary } from '../core-library.js';
import { authFailureDetail } from '../profiles/auth-failure.js';
import type { CredentialResolver } from '../profiles/credential-resolver.js';
import { pickProfile } from '../profiles/profile-picker.js';
import type { ProfileStore } from '../profiles/profile-store.js';
import { browseStories, prepareTemplateStoryBrowser } from '../stories/story-browser.js';
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
/** Run these Stories as a plain dry run (Stories a stopped run never started). */
interface RunStoriesMessage { type: 'runStories'; storyIds: string[]; }
/** Stop the live run: no new Story or Task starts, and the result shows what was done. */
interface CancelRunMessage { type: 'cancelRun'; }
type WebviewMessage = SwitchModeMessage | CreateTasksMessage | ManageProfilesMessage | OpenLinkMessage | FinishStoriesMessage | RunStoriesMessage | CancelRunMessage;

/** How the panel was opened: to generate, or to finish Partly Created Stories (a resume). */
export interface GenerateOpenOptions { resume?: boolean; }

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
	try {
		const adapter = await credentialResolver.resolveByName(profile);
		const { template } = await createTemplateLibrary().loadSource(resolveDocumentPath(fileUri));
		const atomizer = new Atomizer(adapter);
		const report = await atomizer.atomize(template, { ...options, stallTimeoutMs: DEFAULT_GENERATION_STALL_TIMEOUT_MS });
		return { report };
	} catch (err) {
		if (err instanceof AuthError) return { error: 'auth', detail: authFailureDetail(err) };
		return { error: 'blocked', detail: errorDetail(err) };
	}
}

/**
 * Lets the user pick Stories with the Story Browser. Resolves undefined when dismissed, and an empty
 * list to run on every Story the Template matches — also the fallback when the browser can't load,
 * so the panel's own auth and blocked views still report the problem.
 */
async function pickGenerateStories(credentialResolver: CredentialResolver, profile: string, fileUri: vscode.Uri, resume: boolean): Promise<string[] | undefined> {
	const source = await prepareTemplateStoryBrowser(credentialResolver, profile, fileUri, { withTasks: resume });
	if (!source) return [];
	return browseStories({
		...source,
		title: resume ? 'Atomize: Finish Partly Created Stories' : 'Atomize: Generate',
		canPickMany: true,
		placeholder: resume
			? 'Tick the Stories to finish: only the Tasks each one is missing are created.'
			: 'Tick Stories to generate for, or press Enter with none ticked to use every Story the Template matches.',
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

		panel.onDidDispose(() => { GeneratePanel._instance = undefined; });
		panel.webview.onDidReceiveMessage((msg: unknown) => { void this._handleMessage(msg); });
	}

	static async open(fileUri: vscode.Uri, store: ProfileStore, credentialResolver: CredentialResolver, options: GenerateOpenOptions = {}): Promise<void> {
		const resume = options.resume === true;
		const mode = getPreviewLayout(fileUri);
		const defaultProfile = getDefaultProfile(fileUri);

		if (GeneratePanel._instance?._isExecuting) {
			GeneratePanel._instance._panel.reveal(vscode.ViewColumn.Beside, true);
			return;
		}

		const profile = await pickProfile(store, credentialResolver, { title: 'Atomize: Generate', allowOffline: false, defaultProfile });
		if (profile == null) return;

		const pickedStoryIds = await pickGenerateStories(credentialResolver, profile, fileUri, resume);
		if (pickedStoryIds === undefined) return;
		// A resume finishes only the Stories named; there is no filter-wide resume.
		if (resume && pickedStoryIds.length === 0) return;
		const storyIds = pickedStoryIds.length > 0 ? pickedStoryIds : undefined;

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

	private async _runDryRun(): Promise<void> {
		this._isExecuting = true;
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

			if (report.tasksSkipped > 0 || report.storiesFailed > 0) {
				this._panel.webview.html = renderGenerateDryWarnings(report, this._mode, fileName, this._profile, this._storyIds);
			} else {
				this._panel.webview.html = renderGenerateDrySuccess(report, this._mode, fileName, this._profile, this._storyIds);
			}
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
				storyIds: this._storyIds,
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

			const execReport = outcome.report as GenerateReport;
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
			if (this._dryRunReport) {
				const report = this._dryRunReport;
				if (report.tasksSkipped > 0 || report.storiesFailed > 0) {
					this._panel.webview.html = renderGenerateDryWarnings(report, this._mode, fileName, this._profile, this._storyIds);
				} else {
					this._panel.webview.html = renderGenerateDrySuccess(report, this._mode, fileName, this._profile, this._storyIds);
				}
			}
		} else if (message.type === 'createTasks') {
			const report = this._dryRunReport;
			if (!report || report.storiesFailed > 0 || report.tasksCalculated === 0) return;

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
			await this._runLive();
		} else if (message.type === 'cancelRun') {
			this._liveRun?.abort();
		} else if (message.type === 'finishStories' || message.type === 'runStories') {
			if (this._isExecuting || !Array.isArray(message.storyIds) || message.storyIds.length === 0) return;
			this._storyIds = message.storyIds.filter((id): id is string => typeof id === 'string');
			this._resume = message.type === 'finishStories';
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
