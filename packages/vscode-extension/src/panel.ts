import * as vscode from 'vscode';

let panel: vscode.WebviewPanel | undefined;

export const AtomizePanel = {
	show(title: string, html: string): void {
		if (panel) {
			panel.title = title;
			panel.webview.html = html;
			panel.reveal(vscode.ViewColumn.Beside, true);
		} else {
			const createdPanel = vscode.window.createWebviewPanel(
				'atomize.panel',
				title,
				{ viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
				{ enableScripts: false, retainContextWhenHidden: true },
			);
			panel = createdPanel;
			createdPanel.webview.html = html;
			createdPanel.onDidDispose(() => { panel = undefined; });
		}
	},

	dispose(): void {
		panel?.dispose();
	},
};
