import * as vscode from 'vscode';
import { stringify as stringifyYaml } from 'yaml';
import { resolveCommandDocument } from '../authoring/command-document-resolution.js';
import { isAtomizeDocument, isMixinDocument } from '../authoring/language-detection.js';
import { createTemplateLibrary } from '../core-library.js';
import { resolveDocumentPath } from './catalog-document-path.js';

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

async function runResolve(filePath: string): Promise<{ yaml: string } | { error: string }> {
	try {
		const { template } = await createTemplateLibrary().loadSource(filePath);
		return { yaml: stringifyYaml(template, { lineWidth: 120 }) };
	} catch (err) {
		return { error: err instanceof Error ? err.message : String(err) };
	}
}

export interface ShowResolvedTemplateCommandDeps {
	provider: ResolvedTemplateProvider;
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
			if (isMixinDocument(doc)) {
				await vscode.window.showInformationMessage('Atomize: Mixins are reusable partial Templates and do not have an effective Template view.');
				return;
			}
			if (!await deps.checkDirtyDocument(doc, 'resolve')) return;

			const result = await vscode.window.withProgress(
				{ location: vscode.ProgressLocation.Window, title: 'Resolving effective template…' },
				() => runResolve(resolveDocumentPath(doc.uri)),
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
