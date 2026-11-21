import { basename } from 'node:path';
import type { ValidationResult } from '@sppg2001/atomize-core/templates/validator';
import * as vscode from 'vscode';
import { isAtomizeDocument, isMixinDocument } from '../authoring/language-detection.js';
import { getDefaultProfile } from '../config/atomize-configuration.js';
import { AtomizePanel } from '../panel.js';
import type { CredentialResolver } from '../profiles/credential-resolver.js';
import { pickProfile } from '../profiles/profile-picker.js';
import type { ProfileStore } from '../profiles/profile-store.js';
import { telemetry } from '../telemetry/extension-telemetry.js';
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
		const startedAt = Date.now();
		const doc = uri
			? vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString())
			: vscode.window.activeTextEditor?.document;
		if (!doc || !isAtomizeDocument(doc)) return;
		if (isMixinDocument(doc)) {
			await vscode.window.showInformationMessage('Atomize: Mixins are validated when they are composed into a Template.');
			return;
		}
		if (!await deps.checkDirtyDocument(doc, 'validate')) {
			telemetry.finished('validate', { mode: 'offline', valid: false, issueCount: 0 }, { outcome: 'cancelled' }, startedAt);
			return;
		}

		const defaultProfile = getDefaultProfile(doc.uri);
		const picked = await pickProfile(deps.store, deps.credentialResolver, { title: 'Atomize: Validate', allowOffline: true, defaultProfile });
		if (picked === null) {
			telemetry.finished('validate', { mode: 'offline', valid: false, issueCount: 0 }, { outcome: 'cancelled' }, startedAt);
			return;
		}
		const profile = picked;

		const mode = profile ? 'Online' : 'Offline';
		const reportProps = (result?: ValidationResult) => ({
			mode: profile ? 'online' as const : 'offline' as const,
			valid: result?.valid ?? false,
			issueCount: result ? Math.min(result.errors.length + result.warnings.length, 1_000_000) : 0,
		});
		runReportValidation(doc, deps.diagnostics, result => {
			// A Template that fails validation is a successful `validate`.
			telemetry.finished('validate', reportProps(result), { outcome: 'success' }, startedAt);
			deps.onValidationSuccess(doc.uri);
			const fileName = basename(doc.uri.fsPath);
			AtomizePanel.show(`Atomize: ${fileName} (${mode})`, renderValidationHtml(result, fileName));
		}, error => {
			telemetry.finished('validate', reportProps(), { error }, startedAt);
			deps.onRunnerFailure(doc);
		}, profile, deps.credentialResolver);
	});
}
