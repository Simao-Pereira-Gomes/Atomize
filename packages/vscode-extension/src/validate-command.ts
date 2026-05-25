import * as vscode from 'vscode';
import { getConfiguredCliPath, type UpdateCheckSummary } from './cli-lifecycle.js';
import { probeCli } from './cli-provider.js';
import { runReportValidation } from './diagnostics.js';
import { isAtomizeDocument } from './language-detection.js';
import { AtomizePanel } from './panel.js';
import { pickProfile } from './profile-picker.js';
import { renderValidationHtml } from './validation-html.js';

export interface ValidateCommandDeps {
	diagnostics: vscode.DiagnosticCollection;
	onValidationSuccess: (uri: vscode.Uri) => void;
	onRunnerFailure: (doc: vscode.TextDocument) => void;
	showCliUnavailable: (cliPath: string, message: string) => Promise<void>;
	checkDirtyDocument: (doc: vscode.TextDocument) => Promise<boolean>;
	checkForCliUpdate: (cliPath: string, version: string | undefined) => Promise<UpdateCheckSummary | undefined>;
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

		const defaultProfile = vscode.workspace.getConfiguration('atomize').get<string>('defaultProfile') || undefined;
		const picked = await pickProfile(cliPath, { title: 'Atomize: Validate', allowOffline: true, defaultProfile });
		if (picked === null) return;
		const profile = picked;

		void deps.checkForCliUpdate(cliPath, probe.version);
		const mode = profile ? 'Online' : 'Offline';
		runReportValidation(doc, deps.diagnostics, cliPath, result => {
			deps.onValidationSuccess(doc.uri);
			const fileName = vscode.workspace.asRelativePath(doc.uri);
			AtomizePanel.show(`Atomize: ${fileName} (${mode})`, renderValidationHtml(result, fileName));
		}, () => { deps.onRunnerFailure(doc); }, profile);
	});
}
