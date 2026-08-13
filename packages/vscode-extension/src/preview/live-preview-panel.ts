import { Atomizer } from '@sppg2001/atomize-core';
import type { AtomizationReport } from '@sppg2001/atomize-core/core/atomizer';
import { AuthError } from '@sppg2001/atomize-core/utils/errors';
import * as vscode from 'vscode';
import { getDefaultProfile, getPreviewLayout } from '../config/atomize-configuration.js';
import { createTemplateLibrary } from '../core-library.js';
import type { CredentialResolver } from '../profiles/credential-resolver.js';
import { pickProfile } from '../profiles/profile-picker.js';
import type { ProfileStore } from '../profiles/profile-store.js';
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

async function runLivePreview(
	credentialResolver: CredentialResolver,
	profile: string,
	fileUri: vscode.Uri,
	storyId: string,
): Promise<{ report: AtomizationReport } | { error: 'auth' | 'notfound'; detail: string }> {
	try {
		const adapter = await credentialResolver.resolveByName(profile);
		const { template } = await createTemplateLibrary().loadSource(fileUri.fsPath);
		const atomizer = new Atomizer(adapter);
		const report = await atomizer.atomize(template, { dryRun: true, storyIds: [storyId] });
		return { report };
	} catch (err) {
		if (err instanceof AuthError) {
			return { error: 'auth', detail: err.message.replace(/^authentication failed[:\s]*/i, '').trim() || 'Personal access token may be expired or revoked.' };
		}
		return { error: 'notfound', detail: err instanceof Error ? err.message : String(err) };
	}
}

export class LivePreviewPanel {
	private static _instance: LivePreviewPanel | undefined;

	private _panel: vscode.WebviewPanel;
	private _fileUri: vscode.Uri;
	private _mode: 'default' | 'compact';
	private _lastReport: AtomizationReport | undefined;

	private constructor(
		panel: vscode.WebviewPanel,
		fileUri: vscode.Uri,
		private readonly _store: ProfileStore,
		private readonly _credentialResolver: CredentialResolver,
		mode: 'default' | 'compact',
	) {
		this._panel = panel;
		this._fileUri = fileUri;
		this._mode = mode;

		panel.onDidDispose(() => { LivePreviewPanel._instance = undefined; });
		panel.webview.onDidReceiveMessage((msg: unknown) => { void this._handleMessage(msg); });
	}

	static async open(fileUri: vscode.Uri, store: ProfileStore, credentialResolver: CredentialResolver): Promise<void> {
		const mode = getPreviewLayout(fileUri);
		const defaultProfile = getDefaultProfile(fileUri);

		const profile = await pickProfile(store, credentialResolver, { title: 'Atomize: Live Preview', allowOffline: false, defaultProfile });
		if (profile == null) return;

		const storyId = await pickStoryId();
		if (storyId === null) return;

		const fileName = vscode.workspace.asRelativePath(fileUri);

		let panel: LivePreviewPanel;
		if (LivePreviewPanel._instance) {
			const inst = LivePreviewPanel._instance;
			inst._fileUri = fileUri;
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
			panel = new LivePreviewPanel(webviewPanel, fileUri, store, credentialResolver, mode);
			LivePreviewPanel._instance = panel;
		}

		await panel._run(storyId, profile);
	}

	private async _run(storyId: string, profile: string): Promise<void> {
		const fileName = vscode.workspace.asRelativePath(this._fileUri);
		this._panel.webview.html = `<!DOCTYPE html><html><body style="color:var(--vscode-editor-foreground);padding:16px">Running…</body></html>`;

		const outcome = await runLivePreview(this._credentialResolver, profile, this._fileUri, storyId);

		if ('error' in outcome) {
			this._panel.webview.html = renderLivePreviewError(outcome.error, outcome.detail, fileName);
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
			await LivePreviewPanel.open(this._fileUri, this._store, this._credentialResolver);
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
