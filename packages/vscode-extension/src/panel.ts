import * as vscode from 'vscode';

export class AtomizePanel {
	private static _panel: vscode.WebviewPanel | undefined;

	static show(title: string, html: string): void {
		if (AtomizePanel._panel) {
			AtomizePanel._panel.title = title;
			AtomizePanel._panel.webview.html = html;
			AtomizePanel._panel.reveal(vscode.ViewColumn.Beside, true);
		} else {
			const panel = vscode.window.createWebviewPanel(
				'atomize.panel',
				title,
				{ viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
				{ enableScripts: false, retainContextWhenHidden: true },
			);
			AtomizePanel._panel = panel;
			panel.webview.html = html;
			panel.onDidDispose(() => { AtomizePanel._panel = undefined; });
		}
	}

	static dispose(): void {
		AtomizePanel._panel?.dispose();
	}
}
