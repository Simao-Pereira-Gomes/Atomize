import * as vscode from 'vscode';
import { buildLivePreviewArgs, CLI_EXIT_CODES, spawnCli } from '../cli/cli-provider.js';
import { getDefaultProfile, getPreviewLayout } from '../config/atomize-configuration.js';
import { pickProfile } from '../profiles/profile-picker.js';
import type { AtomizationReport } from './live-preview-html.js';
import { renderLivePreviewError, renderLivePreviewResults } from './live-preview-html.js';

interface SwitchModeMessage { type: 'switchMode'; mode: 'default' | 'compact'; }
interface RerunMessage { type: 'rerun'; }
interface OpenTemplateMessage { type: 'openTemplate'; }
interface ManageProfilesMessage { type: 'manageProfiles'; }
interface OpenLinkMessage { type: 'openLink'; url: string; }
type WebviewMessage = SwitchModeMessage | RerunMessage | OpenTemplateMessage | ManageProfilesMessage | OpenLinkMessage;

async function pickStoryId(): Promise<string | null> {
	const value = await vscode.window.showInputBox({
		title: 'Atomize: Live Preview',
		prompt: 'Work item ID to preview against',
		validateInput: v => /^\d+$/.test(v.trim()) ? undefined : 'Enter a numeric work item ID',
	});
	return value?.trim() ?? null;
}

function spawnGenJson(cliPath: string, filePath: string, storyId: string, profile: string): Promise<{ report: AtomizationReport } | { error: 'auth' | 'notfound'; stderr: string }> {
	return new Promise(resolve => {
		const proc = spawnCli(cliPath, buildLivePreviewArgs(filePath, storyId, profile));
		let stdout = '';
		let stderr = '';
		proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
		proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
		proc.on('close', code => {
			if (code !== 0) {
				const kind = code === CLI_EXIT_CODES.AuthFailure ? 'auth' as const : 'notfound' as const;
				const cleanStderr = stderr.split('\n').filter(l => !/^\(node:\d+\)/.test(l) && !/^\(Use `node /.test(l)).join('\n').trim();
				resolve({ error: kind, stderr: (cleanStderr || stdout).trim() });
				return;
			}
			try {
				resolve({ report: JSON.parse(stdout.trim()) as AtomizationReport });
			} catch {
				resolve({ error: 'notfound', stderr: stderr.trim() || 'Failed to parse CLI output' });
			}
		});
		proc.on('error', err => resolve({ error: 'notfound', stderr: err.message }));
	});
}

export class LivePreviewPanel {
	private static _instance: LivePreviewPanel | undefined;

	private _panel: vscode.WebviewPanel;
	private _fileUri: vscode.Uri;
	private _cliPath: string;
	private _mode: 'default' | 'compact';
	private _lastReport: AtomizationReport | undefined;

	private constructor(
		panel: vscode.WebviewPanel,
		fileUri: vscode.Uri,
		cliPath: string,
		mode: 'default' | 'compact',
	) {
		this._panel = panel;
		this._fileUri = fileUri;
		this._cliPath = cliPath;
		this._mode = mode;

		panel.onDidDispose(() => { LivePreviewPanel._instance = undefined; });
		panel.webview.onDidReceiveMessage((msg: unknown) => { void this._handleMessage(msg); });
	}

	static async open(fileUri: vscode.Uri, cliPath: string): Promise<void> {
		const mode = getPreviewLayout(fileUri);
		const defaultProfile = getDefaultProfile(fileUri);

		const profile = await pickProfile(cliPath, { title: 'Atomize: Live Preview', allowOffline: false, defaultProfile });
		if (profile == null) return;

		const storyId = await pickStoryId();
		if (storyId === null) return;

		const fileName = vscode.workspace.asRelativePath(fileUri);

		let panel: LivePreviewPanel;
		if (LivePreviewPanel._instance) {
			const inst = LivePreviewPanel._instance;
			inst._fileUri = fileUri;
			inst._cliPath = cliPath;
			inst._mode = mode;
			inst._lastReport = undefined;
			inst._panel.title = `Atomize: ${fileName} (Live Preview — Dry Run)`;
			inst._panel.reveal(vscode.ViewColumn.Beside, true);
			panel = inst;
		} else {
			const webviewPanel = vscode.window.createWebviewPanel(
				'atomize.livePreview',
				`Atomize: ${fileName} (Live Preview — Dry Run)`,
				{ viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
				{ enableScripts: true, retainContextWhenHidden: true },
			);
			panel = new LivePreviewPanel(webviewPanel, fileUri, cliPath, mode);
			LivePreviewPanel._instance = panel;
		}

		await panel._run(storyId, profile);
	}

	private async _run(storyId: string, profile: string): Promise<void> {
		const fileName = vscode.workspace.asRelativePath(this._fileUri);
		this._panel.webview.html = `<!DOCTYPE html><html><body style="color:var(--vscode-editor-foreground);padding:16px">Running…</body></html>`;

		const outcome = await spawnGenJson(this._cliPath, this._fileUri.fsPath, storyId, profile);

		if ('error' in outcome) {
			this._panel.webview.html = renderLivePreviewError(outcome.error, outcome.stderr, fileName);
		} else {
			this._lastReport = outcome.report;
			this._panel.webview.html = renderLivePreviewResults(outcome.report, this._mode, fileName);
		}
	}

	private async _handleMessage(msg: unknown): Promise<void> {
		if (typeof msg !== 'object' || msg === null) return;
		const message = msg as WebviewMessage;

		if (message.type === 'switchMode') {
			this._mode = message.mode;
			if (this._lastReport) {
				const fileName = vscode.workspace.asRelativePath(this._fileUri);
				this._panel.webview.html = renderLivePreviewResults(this._lastReport, this._mode, fileName);
			}
		} else if (message.type === 'rerun') {
			LivePreviewPanel._instance?._panel.dispose();
			await LivePreviewPanel.open(this._fileUri, this._cliPath);
		} else if (message.type === 'openTemplate') {
			await vscode.commands.executeCommand('vscode.open', this._fileUri);
		} else if (message.type === 'manageProfiles') {
			await vscode.commands.executeCommand('atomize.manageProfiles');
		} else if (message.type === 'openLink') {
			await vscode.env.openExternal(vscode.Uri.parse(message.url));
		}
	}

	static dispose(): void {
		LivePreviewPanel._instance?._panel.dispose();
	}
}
