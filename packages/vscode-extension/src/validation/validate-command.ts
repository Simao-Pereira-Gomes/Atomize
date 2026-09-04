import * as vscode from 'vscode';
import { isAtomizeDocument, isMixinDocument } from '../authoring/language-detection.js';
import { getDefaultProfile } from '../config/atomize-configuration.js';
import { AtomizePanel } from '../panel.js';
import type { CredentialResolver } from '../profiles/credential-resolver.js';
import { pickProfile } from '../profiles/profile-picker.js';
import type { ProfileStore } from '../profiles/profile-store.js';
import { runReportValidation } from './diagnostics.js';
import { renderValidationHtml } from './validation-html.js';

export interface ValidateCommandDeps {
	diagnostics: vscode.DiagnosticCollection;
	store: ProfileStore;
	credentialResolver: CredentialResolver;
	onValidationSuccess: (uri: vscode.Uri) => void;
	onRunnerFailure: (doc: vscode.TextDocument) => void;
	checkDirtyDocument: (doc: vscode.TextDocument, verb: string) => Promise<boolean>;
}

export function registerValidateCommand(deps: ValidateCommandDeps): vscode.Disposable {
	return vscode.commands.registerCommand('atomize.validate', async (uri?: vscode.Uri) => {
		const doc = uri
			? vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString())
			: vscode.window.activeTextEditor?.document;
		if (!doc || !isAtomizeDocument(doc)) return;
		if (isMixinDocument(doc)) {
			await vscode.window.showInformationMessage('Atomize: Mixins are validated when they are composed into a Template.');
			return;
		}
		if (!await deps.checkDirtyDocument(doc, 'validate')) return;

		const defaultProfile = getDefaultProfile(doc.uri);
		const picked = await pickProfile(deps.store, deps.credentialResolver, { title: 'Atomize: Validate', allowOffline: true, defaultProfile });
		if (picked === null) return;
		const profile = picked;

		const mode = profile ? 'Online' : 'Offline';
		runReportValidation(doc, deps.diagnostics, result => {
			deps.onValidationSuccess(doc.uri);
			const fileName = vscode.workspace.asRelativePath(doc.uri);
			AtomizePanel.show(`Atomize: ${fileName} (${mode})`, renderValidationHtml(result, fileName));
		}, () => { deps.onRunnerFailure(doc); }, profile, deps.credentialResolver);
	});
}
