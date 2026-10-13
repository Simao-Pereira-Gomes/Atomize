import * as vscode from 'vscode';

export function getDefaultProfile(resource?: vscode.Uri): string | undefined {
	return vscode.workspace.getConfiguration('atomize', resource).get<string>('defaultProfile') || undefined;
}

export function getPreviewLayout(resource?: vscode.Uri): 'default' | 'compact' {
	return vscode.workspace.getConfiguration('atomize', resource).get<string>('previewLayout', 'default') === 'compact'
		? 'compact'
		: 'default';
}

/** The Copilot model family `atomize.ai.model` pins, or "auto" to let Atomize pick an available one. */
export function getAIModel(): string {
	return vscode.workspace.getConfiguration('atomize').get<string>('ai.model', 'auto') || 'auto';
}

export function getSchemaReferenceOpenMode(resource?: vscode.Uri): 'beside' | 'editor' {
	return vscode.workspace.getConfiguration('atomize', resource).get<string>('schemaReference.openMode', 'editor') === 'beside'
		? 'beside'
		: 'editor';
}
