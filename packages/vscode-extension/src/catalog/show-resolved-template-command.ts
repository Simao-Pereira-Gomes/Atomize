import { spawn } from 'node:child_process';
import * as vscode from 'vscode';
import { isAtomizeDocument } from '../authoring/language-detection.js';
import { resolveCommandDocument } from '../authoring/command-document-resolution.js';
import { buildResolveArgs, probeCli } from '../cli/cli-provider.js';
import { extendedEnv } from '../cli/env-utils.js';
import { getConfiguredCliPath } from '../config/atomize-configuration.js';

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
		path: `/${relativePath} (Effective)`,
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
			if (code === 0) {
				resolve({ yaml: stdout });
				return;
			}

			resolve({ error: stderr.trim() || stdout.trim() || 'Template resolution failed.' });
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
		try {
			const doc = await resolveCommandDocument(
				uri,
				vscode.window.activeTextEditor?.document,
				vscode.workspace.textDocuments,
				target => vscode.workspace.openTextDocument(target as vscode.Uri),
			);
			if (!doc) {
				await vscode.window.showErrorMessage('Atomize: Open an Atomize YAML file before resolving the effective template.');
				return;
			}
			if (!isAtomizeDocument(doc)) {
				await vscode.window.showErrorMessage('Atomize: The selected file is not recognized as an Atomize YAML file.');
				return;
			}
			if (!await deps.checkDirtyDocument(doc, 'resolve')) return;

			const cliPath = getConfiguredCliPath();
			const probe = await probeCli(cliPath);
			if (!probe.available) {
				await deps.showCliUnavailable(cliPath, 'Atomize CLI not found. Install it to resolve templates.');
				return;
			}

			const result = await vscode.window.withProgress(
				{ location: vscode.ProgressLocation.Window, title: 'Resolving effective template…' },
				() => runResolve(cliPath, doc.uri.fsPath),
			);

			if ('error' in result) {
				await vscode.window.showErrorMessage(`Atomize: ${result.error}`);
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
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await vscode.window.showErrorMessage(`Atomize: Could not resolve the effective template. ${message}`);
		}
	});
}
