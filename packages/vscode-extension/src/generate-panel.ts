import { spawn } from 'node:child_process';
import * as vscode from 'vscode';
import { buildGenDryRunJsonArgs, buildGenExecuteJsonArgs, CLI_EXIT_CODES } from './cli-provider.js';
import { extendedEnv } from './env-utils.js';
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
import { pickProfile } from './profile-picker.js';

interface SwitchModeMessage { type: 'switchMode'; mode: 'default' | 'compact'; }
interface CreateTasksMessage { type: 'createTasks'; continueOnError: boolean; }
interface ManageProfilesMessage { type: 'manageProfiles'; }
type WebviewMessage = SwitchModeMessage | CreateTasksMessage | ManageProfilesMessage;

type SpawnResult = { report: GenerateReport } | { error: 'auth' | 'cli'; stderr: string };

function spawnJson(cliPath: string, args: string[]): Promise<SpawnResult> {
	return new Promise(resolve => {
		const proc = spawn(cliPath, args, { shell: false, env: extendedEnv() });
		let stdout = '';
		let stderr = '';
		proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
		proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
		proc.on('close', code => {
			if (code !== 0) {
				const kind = code === CLI_EXIT_CODES.AuthFailure ? 'auth' as const : 'cli' as const;
				const cleanStderr = stderr.split('\n').filter(l => !/^\(node:\d+\)/.test(l) && !/^\(Use `node /.test(l)).join('\n').trim();
				resolve({ error: kind, stderr: (cleanStderr || stdout).trim() });
				return;
			}
			try {
				resolve({ report: JSON.parse(stdout.trim()) as GenerateReport });
			} catch {
				resolve({ error: 'cli', stderr: stderr.trim() || 'Failed to parse CLI output' });
			}
		});
		proc.on('error', err => resolve({ error: 'cli', stderr: err.message }));
	});
}

export class GeneratePanel {
	private static _instance: GeneratePanel | undefined;

	private _panel: vscode.WebviewPanel;
	private _fileUri: vscode.Uri;
	private _cliPath: string;
	private _mode: 'default' | 'compact';
	private _profile: string;
	private _dryRunReport: GenerateReport | undefined;
	private _execReport: GenerateReport | undefined;
	private _continueOnError: boolean = false;

	private constructor(
		panel: vscode.WebviewPanel,
		fileUri: vscode.Uri,
		cliPath: string,
		mode: 'default' | 'compact',
		profile: string,
	) {
		this._panel = panel;
		this._fileUri = fileUri;
		this._cliPath = cliPath;
		this._mode = mode;
		this._profile = profile;

		panel.onDidDispose(() => { GeneratePanel._instance = undefined; });
		panel.webview.onDidReceiveMessage((msg: unknown) => { void this._handleMessage(msg); });
	}

	static async open(fileUri: vscode.Uri, cliPath: string): Promise<void> {
		const atomizeCfg = vscode.workspace.getConfiguration('atomize');
		const mode: 'default' | 'compact' = atomizeCfg.get<string>('previewLayout', 'default') === 'compact' ? 'compact' : 'default';
		const defaultProfile = atomizeCfg.get<string>('defaultProfile') || undefined;

		const profile = await pickProfile(cliPath, { title: 'Atomize: Generate', allowOffline: false, defaultProfile });
		if (profile == null) return;

		const fileName = vscode.workspace.asRelativePath(fileUri);

		let panel: GeneratePanel;
		if (GeneratePanel._instance) {
			const inst = GeneratePanel._instance;
			inst._fileUri = fileUri;
			inst._cliPath = cliPath;
			inst._mode = mode;
			inst._profile = profile;
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
			panel = new GeneratePanel(webviewPanel, fileUri, cliPath, mode, profile);
			GeneratePanel._instance = panel;
		}

		await panel._runDryRun();
	}

	private async _runDryRun(): Promise<void> {
		const fileName = vscode.workspace.asRelativePath(this._fileUri);
		this._panel.webview.html = renderGenerateLoading(fileName, this._profile);

		const outcome = await spawnJson(
			this._cliPath,
			buildGenDryRunJsonArgs(this._fileUri.fsPath, this._profile),
		);

		if ('error' in outcome) {
			if (outcome.error === 'auth') {
				const detail = outcome.stderr.replace(/^authentication failed[:\s]*/i, '').trim();
				this._panel.webview.html = renderGenerateBlocked('auth', detail || 'Personal access token may be expired or revoked.', fileName, this._profile);
			} else {
				this._panel.webview.html = renderGenerateBlocked(
					'no-matches',
					outcome.stderr || 'CLI error — check that the template file is valid.',
					fileName,
					this._profile,
				);
			}
			return;
		}

		const report = outcome.report;
		this._dryRunReport = report;
		this._panel.title = `Atomize: ${fileName} (Generate)`;

		if (report.storiesProcessed === 0) {
			this._panel.webview.html = renderGenerateBlocked(
				'no-matches',
				'The filter returned no work items. Check your YAML filter conditions and verify the profile has access to the configured project.',
				fileName,
				this._profile,
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
			);
			return;
		}

		if (report.tasksSkipped > 0 || report.storiesFailed > 0) {
			this._panel.webview.html = renderGenerateDryWarnings(report, this._mode, fileName, this._profile);
		} else {
			this._panel.webview.html = renderGenerateDrySuccess(report, this._mode, fileName, this._profile);
		}
	}

	private async _runLive(): Promise<void> {
		const dryReport = this._dryRunReport;
		if (!dryReport) return;

		const fileName = vscode.workspace.asRelativePath(this._fileUri);
		this._panel.title = `Atomize: ${fileName} (Generate — Creating…)`;
		this._panel.webview.html = renderGenerateLiveRunning(dryReport, fileName, this._profile);

		const outcome = await spawnJson(
			this._cliPath,
			buildGenExecuteJsonArgs(this._fileUri.fsPath, this._profile, this._continueOnError),
		);

		this._panel.title = `Atomize: ${fileName} (Generate — Done)`;

		if ('error' in outcome) {
			const detail = outcome.error === 'auth'
				? outcome.stderr.replace(/^authentication failed[:\s]*/i, '').trim() || 'Personal access token may be expired or revoked.'
				: outcome.stderr || 'CLI error during task creation.';
			this._panel.webview.html = renderGenerateBlocked(
				outcome.error === 'auth' ? 'auth' : 'no-matches',
				detail,
				fileName,
				this._profile,
			);
			return;
		}

		const execReport = outcome.report;
		this._execReport = execReport;

		if (execReport.storiesFailed > 0) {
			this._panel.webview.html = renderGenerateLivePartial(dryReport, execReport, this._mode, fileName, this._profile);
		} else {
			this._panel.webview.html = renderGenerateLiveSuccess(dryReport, execReport, this._mode, fileName, this._profile);
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
					this._panel.webview.html = renderGenerateLivePartial(this._dryRunReport, this._execReport, this._mode, fileName, this._profile);
				} else {
					this._panel.webview.html = renderGenerateLiveSuccess(this._dryRunReport, this._execReport, this._mode, fileName, this._profile);
				}
				return;
			}

			// Dry-run phase: re-render dry result
			if (this._dryRunReport) {
				const report = this._dryRunReport;
				if (report.tasksSkipped > 0 || report.storiesFailed > 0) {
					this._panel.webview.html = renderGenerateDryWarnings(report, this._mode, fileName, this._profile);
				} else {
					this._panel.webview.html = renderGenerateDrySuccess(report, this._mode, fileName, this._profile);
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
		}
	}

	static dispose(): void {
		GeneratePanel._instance?._panel.dispose();
	}
}
