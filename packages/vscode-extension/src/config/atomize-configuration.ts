import * as vscode from 'vscode';
import { normalizeCliPath, normalizeInstallCommand } from '../cli/cli-provider.js';

export function getConfiguredCliPath(resource?: vscode.Uri): string {
	return normalizeCliPath(vscode.workspace.getConfiguration('atomize', resource).get('cliPath'));
}

export function getConfiguredInstallCommand(resource?: vscode.Uri): string {
	return normalizeInstallCommand(vscode.workspace.getConfiguration('atomize', resource).get('cli.installCommand'));
}

export function getAutoCheckUpdates(resource?: vscode.Uri): boolean {
	return vscode.workspace.getConfiguration('atomize', resource).get('cli.autoCheckUpdates', true);
}

export function getDefaultProfile(resource?: vscode.Uri): string | undefined {
	return vscode.workspace.getConfiguration('atomize', resource).get<string>('defaultProfile') || undefined;
}

export function getPreviewLayout(resource?: vscode.Uri): 'default' | 'compact' {
	return vscode.workspace.getConfiguration('atomize', resource).get<string>('previewLayout', 'default') === 'compact'
		? 'compact'
		: 'default';
}
