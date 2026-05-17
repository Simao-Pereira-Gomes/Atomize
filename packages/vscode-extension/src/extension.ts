import * as vscode from 'vscode';
import { spawn } from 'node:child_process';

const INSTALL_URL = 'https://www.npmjs.com/package/@sppg2001/atomize';

let cliWarningShown = false;

function checkCliAvailable(): Promise<boolean> {
	return new Promise(resolve => {
		const proc = spawn('atomize', ['--version']);
		proc.on('close', code => resolve(code === 0));
		proc.on('error', () => resolve(false));
	});
}

export async function activate(_ctx: vscode.ExtensionContext): Promise<void> {
	const found = await checkCliAvailable();
	if (!found && !cliWarningShown) {
		cliWarningShown = true;
		const selection = await vscode.window.showWarningMessage(
			'Atomize CLI not found. Install it to enable validation, preview, and testing.',
			'Install'
		);
		if (selection === 'Install') {
			await vscode.env.openExternal(vscode.Uri.parse(INSTALL_URL));
		}
	}
}

export function deactivate(): void {}
