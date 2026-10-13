import { randomBytes } from 'node:crypto';
import type { SchemaTab } from '@sppg2001/atomize-schema-reference';
import * as vscode from 'vscode';

const GUIDE_URL = 'https://github.com/Simao-Pereira-Gomes/atomize/blob/main/docs/Template-Reference.md';

export interface SchemaReferenceDestination {
	tab: SchemaTab;
	permalink?: string;
}

export type SchemaReferenceOpenMode = 'beside' | 'editor';

let panel: vscode.WebviewPanel | undefined;
let openMode: SchemaReferenceOpenMode = 'beside';
let destination: SchemaReferenceDestination = { tab: 'template' };

export const SchemaReferencePanel = {
	async open(ctx: vscode.ExtensionContext, target: SchemaReferenceDestination = { tab: 'template' }, mode: SchemaReferenceOpenMode = 'editor'): Promise<void> {
		destination = target;
		const moving = openMode !== mode;
		const column = mode === 'editor'
			? vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One
			: vscode.ViewColumn.Beside;
		openMode = mode;
		if (panel) {
			void panel.webview.postMessage({ type: 'navigate', ...destination });
			panel.reveal(moving ? column : undefined);
			if (moving && mode === 'beside') await widenReference();
			return;
		}
		const assets = vscode.Uri.joinPath(ctx.extensionUri, 'dist', 'schema-reference');
		const createdPanel = vscode.window.createWebviewPanel(
			'atomize.schemaReference',
			'Atomize Schema Reference',
			column,
			{ enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [assets] },
		);
		panel = createdPanel;
		const messages = createdPanel.webview.onDidReceiveMessage((message: unknown) => {
			if (typeof message !== 'object' || message === null) return;
			const { type, url } = message as { type?: unknown; url?: unknown };
			if (type === 'ready') {
				void createdPanel.webview.postMessage({ type: 'navigate', ...destination });
				return;
			}
			if (type !== 'openGuide' || typeof url !== 'string') return;
			// Only this host's Template Reference links can leave the webview.
			if (url.startsWith(`${GUIDE_URL}#`)) void vscode.env.openExternal(vscode.Uri.parse(url));
		});
		createdPanel.onDidDispose(() => {
			messages.dispose();
			panel = undefined;
		});
		const webview = panel.webview;
		const script = webview.asWebviewUri(vscode.Uri.joinPath(assets, 'schema-reference.js'));
		const stylesheet = webview.asWebviewUri(vscode.Uri.joinPath(assets, 'schema-reference.css'));
		const nonce = randomBytes(16).toString('hex');
		webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<title>Atomize Schema Reference</title>
<link rel="stylesheet" href="${stylesheet}">
</head>
<body>
<div id="schema-reference" data-version="${String(ctx.extension.packageJSON.version).replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`)}"></div>
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
		panel.reveal();
		if (mode === 'beside') await widenReference();
	},

	dispose(): void {
		panel?.dispose();
	},
};

async function widenReference(): Promise<void> {
	// Give a new split more room, then preserve the user's width on subsequent opens.
	await vscode.commands.executeCommand('workbench.action.increaseViewWidth');
	await vscode.commands.executeCommand('workbench.action.increaseViewWidth');
}
