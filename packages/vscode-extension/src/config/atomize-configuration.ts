import * as vscode from 'vscode';

export function getDefaultProfile(resource?: vscode.Uri): string | undefined {
	return vscode.workspace.getConfiguration('atomize', resource).get<string>('defaultProfile') || undefined;
}

export function getPreviewLayout(resource?: vscode.Uri): 'default' | 'compact' {
	return vscode.workspace.getConfiguration('atomize', resource).get<string>('previewLayout', 'default') === 'compact'
		? 'compact'
		: 'default';
}
