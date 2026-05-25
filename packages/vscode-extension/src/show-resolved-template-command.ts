import { spawn } from 'node:child_process';
import * as vscode from 'vscode';
import { getConfiguredCliPath } from './cli-lifecycle.js';
import { buildResolveArgs, probeCli } from './cli-provider.js';
import { extendedEnv } from './env-utils.js';
import { isAtomizeDocument } from './language-detection.js';

export const RESOLVED_TEMPLATE_SCHEME = 'atomize-resolved';

export class ResolvedTemplateProvider implements vscode.TextDocumentContentProvider, vscode.Disposable {
	private readonly _content = new Map<string, string>();
	private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
	readonly onDidChange = this._onDidChange.event;

	set(uri: vscode.Uri, content: string): void {
		this._content.set(uri.toString(), content);
		this._onDidChange.fire(uri);
	}

	delete(uri: vscode.Uri): void {
		this._content.delete(uri.toString());
	}

	provideTextDocumentContent(uri: vscode.Uri): string {
		return this._content.get(uri.toString()) ?? '';
	}

	dispose(): void {
		this._onDidChange.dispose();
	}
}

function virtualUri(sourceUri: vscode.Uri): vscode.Uri {
	const relativePath = vscode.workspace.asRelativePath(sourceUri);
	return vscode.Uri.from({
		scheme: RESOLVED_TEMPLATE_SCHEME,
		authority: 'resolve',
		path: `/${relativePath} (Resolved)`,
	});
}

function runResolve(cliPath: string, filePath: string): Promise<{ yaml: string } | { error: string }> {
	return new Promise(resolve => {
		const proc = spawn(cliPath, buildResolveArgs(filePath), { shell: false, env: extendedEnv() });
		let stdout = '';
		let stderr = '';
		proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
		proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
		proc.on('close', code => {
			if (code === 0) resolve({ yaml: stdout });
			else resolve({ error: stderr.trim() || 'Template resolution failed.' });
		});
		proc.on('error', () => resolve({ error: 'Could not start the Atomize CLI.' }));
	});
}

export interface ShowResolvedTemplateCommandDeps {
	provider: ResolvedTemplateProvider;
	showCliUnavailable: (cliPath: string, message: string) => Promise<void>;
	checkDirtyDocument: (doc: vscode.TextDocument, verb: string) => Promise<boolean>;
}

export function registerShowResolvedTemplateCommand(deps: ShowResolvedTemplateCommandDeps): vscode.Disposable {
	return vscode.commands.registerCommand('atomize.showResolvedTemplate', async (uri?: vscode.Uri) => {
		const doc = uri
			? vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString())
			: vscode.window.activeTextEditor?.document;
		if (!doc || !isAtomizeDocument(doc)) return;
		if (!await deps.checkDirtyDocument(doc, 'resolve')) return;

		const cliPath = getConfiguredCliPath();
		const probe = await probeCli(cliPath);
		if (!probe.available) {
			await deps.showCliUnavailable(cliPath, 'Atomize CLI not found. Install it to resolve templates.');
			return;
		}

		const result = await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Window, title: 'Resolving template…' },
			() => runResolve(cliPath, doc.uri.fsPath),
		);

		if ('error' in result) {
			void vscode.window.showErrorMessage(`Atomize: ${result.error}`);
			return;
		}

		const target = virtualUri(doc.uri);
		deps.provider.set(target, result.yaml);

		const resolved = await vscode.workspace.openTextDocument(target);
		await vscode.languages.setTextDocumentLanguage(resolved, 'yaml');
		await vscode.window.showTextDocument(resolved, {
			viewColumn: vscode.ViewColumn.Beside,
			preserveFocus: true,
			preview: false,
		});
	});
}
