import { spawn } from 'node:child_process';
import * as vscode from 'vscode';
import { buildAuthListArgs, buildLivePreviewArgs, CLI_EXIT_CODES } from './cli-provider.js';
import { extendedEnv } from './env-utils.js';
import type { AtomizationReport } from './live-preview-html.js';
import { renderLivePreviewError, renderLivePreviewResults } from './live-preview-html.js';
import { manageProfiles } from './profile-management.js';
import { type AdoProfileJson, parseAdoProfilesJson, sortAdoProfiles } from './profile-management-model.js';

interface SwitchModeMessage { type: 'switchMode'; mode: 'default' | 'compact'; }
interface RerunMessage { type: 'rerun'; }
interface OpenTemplateMessage { type: 'openTemplate'; }
interface ManageProfilesMessage { type: 'manageProfiles'; }
type WebviewMessage = SwitchModeMessage | RerunMessage | OpenTemplateMessage | ManageProfilesMessage;

function fetchAdoProfiles(cliPath: string): Promise<AdoProfileJson[] | null> {
	return new Promise(resolve => {
		const proc = spawn(cliPath, buildAuthListArgs(), { shell: false, env: extendedEnv() });
		let stdout = '';
		proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
		proc.on('close', () => { resolve(parseAdoProfilesJson(stdout) ?? null); });
		proc.on('error', () => resolve(null));
	});
}

async function pickProfile(cliPath: string): Promise<string | null> {
	let adoProfiles = await fetchAdoProfiles(cliPath);
	if (adoProfiles === null) {
		void vscode.window.showErrorMessage('Could not list Azure DevOps profiles.');
		return null;
	}

	while (true) {
		if (adoProfiles.length === 0) {
			type ZeroItem = vscode.QuickPickItem & { action: 'add' | 'cancel' };
			const picked = await vscode.window.showQuickPick<ZeroItem>(
				[{ label: 'Add profile...', action: 'add' }],
				{ title: 'Atomize: Live Preview', placeHolder: 'No Azure DevOps profiles configured — required for Live Preview' },
			);
			if (!picked) return null;
			await manageProfiles(cliPath, async () => true);
			adoProfiles = await fetchAdoProfiles(cliPath);
			if (adoProfiles === null) {
				void vscode.window.showErrorMessage('Could not list Azure DevOps profiles.');
				return null;
			}
		} else {
			type ProfileItem = vscode.QuickPickItem & { profileName: string };
			const picked = await vscode.window.showQuickPick<ProfileItem>(
				sortAdoProfiles(adoProfiles).map(p => ({
					label: p.name,
					description: p.isDefault ? 'default' : '',
					detail: `${p.organizationUrl} · ${p.project}`,
					profileName: p.name,
				})),
				{ title: 'Atomize: Live Preview', placeHolder: 'Select a connection profile' },
			);
			if (!picked) return null;
			return picked.profileName;
		}
	}
}

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
		const proc = spawn(cliPath, buildLivePreviewArgs(filePath, storyId, profile), { shell: false, env: extendedEnv() });
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
		const cfg = vscode.workspace.getConfiguration('atomize').get<string>('previewLayout', 'default');
		const mode: 'default' | 'compact' = cfg === 'compact' ? 'compact' : 'default';

		const profile = await pickProfile(cliPath);
		if (profile === null) return;

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
		}
	}

	static dispose(): void {
		LivePreviewPanel._instance?._panel.dispose();
	}
}
