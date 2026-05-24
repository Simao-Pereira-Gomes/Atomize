import { spawn } from 'node:child_process';
import * as vscode from 'vscode';
import { getConfiguredCliPath } from './cli-lifecycle.js';
import { buildAuthListArgs, probeCli } from './cli-provider.js';
import { runReportValidation } from './diagnostics.js';
import { extendedEnv } from './env-utils.js';
import { isAtomizeDocument } from './language-detection.js';
import { AtomizePanel } from './panel.js';
import { manageProfiles } from './profile-management.js';
import { type AdoProfileJson, parseAdoProfilesJson, sortAdoProfiles } from './profile-management-model.js';
import { renderValidationHtml } from './validation-html.js';

export interface ValidateCommandDeps {
	diagnostics: vscode.DiagnosticCollection;
	onValidationSuccess: (uri: vscode.Uri) => void;
	onRunnerFailure: (doc: vscode.TextDocument) => void;
	showCliUnavailable: (cliPath: string, message: string) => Promise<void>;
	checkDirtyDocument: (doc: vscode.TextDocument) => Promise<boolean>;
	checkForCliUpdate: (cliPath: string, version: string | undefined) => Promise<void>;
}

function fetchAdoProfiles(cliPath: string): Promise<AdoProfileJson[] | null> {
	return new Promise(resolve => {
		const proc = spawn(cliPath, buildAuthListArgs(), { shell: false, env: extendedEnv() });
		let stdout = '';
		proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
		proc.on('close', () => { resolve(parseAdoProfilesJson(stdout) ?? null); });
		proc.on('error', () => resolve(null));
	});
}

export function registerValidateCommand(deps: ValidateCommandDeps): vscode.Disposable {
	return vscode.commands.registerCommand('atomize.validate', async (uri?: vscode.Uri) => {
		const doc = uri
			? vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString())
			: vscode.window.activeTextEditor?.document;
		if (!doc || !isAtomizeDocument(doc)) return;
		if (!await deps.checkDirtyDocument(doc)) return;

		const cliPath = getConfiguredCliPath();
		const probe = await probeCli(cliPath);
		if (!probe.available) {
			await deps.showCliUnavailable(cliPath, 'Atomize CLI not found. Install it to enable validation and preview.');
			return;
		}

		let profile: string | undefined;
		let adoProfiles = await fetchAdoProfiles(cliPath);

		if (adoProfiles === null) {
			void vscode.window.showErrorMessage('Could not list Azure DevOps profiles.');
			return;
		}

		while (true) {
			if (adoProfiles.length === 0) {
				type ZeroItem = vscode.QuickPickItem & { action: 'offline' | 'add' };
				const picked = await vscode.window.showQuickPick<ZeroItem>(
					[
						{ label: 'Run offline', action: 'offline' },
						{ label: 'Add profile...', action: 'add' },
					],
					{ title: 'Atomize: Validate', placeHolder: 'No Azure DevOps profiles configured' },
				);
				if (!picked) return;
				if (picked.action === 'offline') break;
				await manageProfiles(cliPath, async () => true);
				adoProfiles = await fetchAdoProfiles(cliPath);
				if (adoProfiles === null) {
					void vscode.window.showErrorMessage('Could not list Azure DevOps profiles.');
					return;
				}
			} else {
				type ProfileItem = vscode.QuickPickItem & { profileName: string | undefined };
				const profileItems: ProfileItem[] = sortAdoProfiles(adoProfiles).map(p => ({
					label: p.name,
					description: p.isDefault ? 'default' : '',
					detail: `${p.organizationUrl} · ${p.project}`,
					profileName: p.name,
				}));
				const offlineItem: ProfileItem = {
					label: 'Offline only',
					description: 'Skip Azure DevOps connection',
					profileName: undefined,
				};
				const picked = await vscode.window.showQuickPick<ProfileItem>(
					[...profileItems, { kind: vscode.QuickPickItemKind.Separator, label: '', profileName: undefined }, offlineItem],
					{ title: 'Atomize: Validate', placeHolder: 'Select a profile or run offline' },
				);
				if (!picked) return;
				profile = picked.profileName;
				break;
			}
		}

		void deps.checkForCliUpdate(cliPath, probe.version);
		const mode = profile ? 'Online' : 'Offline';
		runReportValidation(doc, deps.diagnostics, cliPath, result => {
			deps.onValidationSuccess(doc.uri);
			const fileName = vscode.workspace.asRelativePath(doc.uri);
			AtomizePanel.show(`Atomize: ${fileName} (${mode})`, renderValidationHtml(result, fileName));
		}, () => { deps.onRunnerFailure(doc); }, profile);
	});
}
