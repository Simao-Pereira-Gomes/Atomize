import { Atomizer } from '@sppg2001/atomize-core';
import type { AtomizationReport, ProgressEvent } from '@sppg2001/atomize-core/core/atomizer';
import { AuthError } from '@sppg2001/atomize-core/utils/errors';
import * as vscode from 'vscode';
import { getDefaultProfile, getPreviewLayout } from '../config/atomize-configuration.js';
import { createTemplateLibrary } from '../core-library.js';
import type { CredentialResolver } from '../profiles/credential-resolver.js';
import { pickProfile } from '../profiles/profile-picker.js';
import type { ProfileStore } from '../profiles/profile-store.js';
import type { GenerateReport } from './generate-html.js';
import {
	renderGenerateBlocked,
	renderGenerateDrySuccess,
	renderGenerateDryWarnings,
	renderGenerateLivePartial,
	renderGenerateLiveRunning,
	renderGenerateLiveSuccess,
	renderGenerateLoading,
} from './generate-html.js';

interface SwitchModeMessage { type: 'switchMode'; mode: 'default' | 'compact'; }
interface CreateTasksMessage { type: 'createTasks'; continueOnError: boolean; }
interface ManageProfilesMessage { type: 'manageProfiles'; }
interface OpenLinkMessage { type: 'openLink'; url: string; }
type WebviewMessage = SwitchModeMessage | CreateTasksMessage | ManageProfilesMessage | OpenLinkMessage;

type GenerateOutcome = { report: AtomizationReport } | { error: 'auth' | 'blocked'; detail: string };

function authDetail(err: AuthError): string {
	return err.message.replace(/^authentication failed[:\s]*/i, '').trim() || 'Personal access token may be expired or revoked.';
}

function errorDetail(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

async function runAtomize(
	credentialResolver: CredentialResolver,
	profile: string,
	fileUri: vscode.Uri,
	options: { dryRun: boolean; continueOnError?: boolean; storyIds?: string[]; onProgress?: (event: ProgressEvent) => void },
): Promise<GenerateOutcome> {
	try {
		const adapter = await credentialResolver.resolveByName(profile);
		const { template } = await createTemplateLibrary().loadSource(fileUri.fsPath);
		const atomizer = new Atomizer(adapter);
		const report = await atomizer.atomize(template, options);
		return { report };
	} catch (err) {
		if (err instanceof AuthError) return { error: 'auth', detail: authDetail(err) };
		return { error: 'blocked', detail: errorDetail(err) };
	}
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

	static async open(fileUri: vscode.Uri, store: ProfileStore, credentialResolver: CredentialResolver): Promise<void> {
		const mode = getPreviewLayout(fileUri);
		const defaultProfile = getDefaultProfile(fileUri);

		if (GeneratePanel._instance?._isExecuting) {
			GeneratePanel._instance._panel.reveal(vscode.ViewColumn.Beside, true);
			return;
		}

		const profile = await pickProfile(store, credentialResolver, { title: 'Atomize: Generate', allowOffline: false, defaultProfile });
		if (profile == null) return;

		const storyIdsInput = await vscode.window.showInputBox({
			title: 'Atomize: Generate',
			prompt: 'Filter to specific story IDs (leave blank to use template filter)',
			placeHolder: '123, 456, 789',
			validateInput: (value): string | undefined => {
				const trimmed = value.trim();
				if (!trimmed) return undefined;
				const parts = trimmed.split(',').map(s => s.trim()).filter(Boolean);
				const invalid = parts.filter(p => !/^\d+$/.test(p));
				if (invalid.length > 0) return `IDs must be numeric. Invalid: ${invalid.join(', ')}`;
				return undefined;
			},
		});
		if (storyIdsInput === undefined) return;
		const storyIds = storyIdsInput.trim()
			? storyIdsInput.split(',').map(s => s.trim()).filter(Boolean)
			: undefined;

		const fileName = vscode.workspace.asRelativePath(fileUri);

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
			inst._panel.title = `Atomize: ${fileName} (Generate — Dry Run)`;
			inst._panel.reveal(vscode.ViewColumn.Beside, true);
			panel = inst;
		} else {
			const webviewPanel = vscode.window.createWebviewPanel(
				'atomize.generate',
				`Atomize: ${fileName} (Generate — Dry Run)`,
				{ viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
				{ enableScripts: true, retainContextWhenHidden: true },
			);
			panel = new GeneratePanel(webviewPanel, fileUri, credentialResolver, mode, profile, storyIds);
			GeneratePanel._instance = panel;
		}

		await panel._runDryRun();
	}

	private async _runDryRun(): Promise<void> {
		this._isExecuting = true;
		try {
			const fileName = vscode.workspace.asRelativePath(this._fileUri);
			this._panel.webview.html = renderGenerateLoading(fileName, this._profile, this._storyIds);

			const outcome = await runAtomize(this._credentialResolver, this._profile, this._fileUri, {
				dryRun: true,
				storyIds: this._storyIds,
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

			if (report.storiesProcessed === 0) {
				const noMatchMsg = this._storyIds
					? `None of the specified story IDs were found, or all were excluded by the template's excludeIfHasTasks filter. Verify the IDs are correct and accessible via the "${this._profile}" profile.`
					: 'The filter returned no work items. Check your YAML filter conditions and verify the profile has access to the configured project.';
				this._panel.webview.html = renderGenerateBlocked('no-matches', noMatchMsg, fileName, this._profile, this._storyIds);
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
		try {
			const fileName = vscode.workspace.asRelativePath(this._fileUri);
			this._panel.title = `Atomize: ${fileName} (Generate — Creating…)`;
			this._panel.webview.html = renderGenerateLiveRunning(dryReport, fileName, this._profile, this._storyIds);

			const outcome = await runAtomize(this._credentialResolver, this._profile, this._fileUri, {
				dryRun: false,
				continueOnError: this._continueOnError,
				storyIds: this._storyIds,
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

			this._panel.title = `Atomize: ${fileName} (Generate — Done)`;

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

			if (execReport.storiesFailed > 0) {
				this._panel.webview.html = renderGenerateLivePartial(dryReport, execReport, this._mode, fileName, this._profile, this._storyIds);
			} else {
				this._panel.webview.html = renderGenerateLiveSuccess(dryReport, execReport, this._mode, fileName, this._profile, this._storyIds);
			}
		} finally {
			this._isExecuting = false;
		}
	}

	private async _handleMessage(msg: unknown): Promise<void> {
		if (typeof msg !== 'object' || msg === null) return;
		const message = msg as WebviewMessage;

		if (message.type === 'switchMode') {
			this._mode = message.mode;
			const fileName = vscode.workspace.asRelativePath(this._fileUri);

			// Live phase: re-render live result
			if (this._execReport && this._dryRunReport) {
				if (this._execReport.storiesFailed > 0) {
					this._panel.webview.html = renderGenerateLivePartial(this._dryRunReport, this._execReport, this._mode, fileName, this._profile, this._storyIds);
				} else {
					this._panel.webview.html = renderGenerateLiveSuccess(this._dryRunReport, this._execReport, this._mode, fileName, this._profile, this._storyIds);
				}
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
			const coeNote = this._continueOnError ? '\n\nContinue on task failure is enabled — if a task fails to create, remaining tasks will still be attempted.' : '';

			const confirmed = await vscode.window.showInformationMessage(
				`Create ${nTasks} task${nTasks === 1 ? '' : 's'} for ${nStories} ${nStories === 1 ? 'story' : 'stories'} using profile "${this._profile}"?${coeNote}`,
				{ modal: true },
				'Create Tasks',
			);

			if (confirmed !== 'Create Tasks') return;
			await this._runLive();
		} else if (message.type === 'manageProfiles') {
			await vscode.commands.executeCommand('atomize.manageProfiles');
		} else if (message.type === 'openLink') {
			await vscode.env.openExternal(vscode.Uri.parse(message.url));
		}
	}

	static dispose(): void {
		GeneratePanel._instance?._panel.dispose();
	}
}
