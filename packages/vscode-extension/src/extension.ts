import * as vscode from 'vscode';
import { createCliLifecycle } from './cli-lifecycle.js';
import { getConfiguredCliPath, probeCli } from './cli-provider.js';
import { AtomizeCodeLensProvider } from './codelens-provider.js';
import { clearRunState, runDiagnosticValidation } from './diagnostics.js';
import {
	handleDocument,
	isAtomizeSchemaDocument,
	isAtomizeToolingDocument,
	isContentOnlyDetected,
} from './language-detection.js';
import { AtomizePanel } from './panel.js';
import { PreviewPanel } from './preview-panel.js';
import { manageProfiles } from './profile-management.js';
import { registerValidateCommand } from './validate-command.js';
import { addSchemaUri, registerYamlSchemaContributor, removeSchemaUri } from './yaml-schema-contributor.js';

let cliWarningShown = false;

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
	// Register schema contributor before anything else to minimise the timing
	// window between extension activation and the YAML LS calling requestSchema.
	await registerYamlSchemaContributor(ctx);

	const { checkForCliUpdate, showCliUnavailableMessage } = createCliLifecycle(ctx);
	const initialCliPath = getConfiguredCliPath();
	const initialProbe = await probeCli(initialCliPath);

	if (!initialProbe.available && !cliWarningShown) {
		cliWarningShown = true;
		await showCliUnavailableMessage(initialCliPath, 'Atomize CLI not found. Install it to enable validation, preview, and testing.');
	}

	const diagnostics = vscode.languages.createDiagnosticCollection('atomize');
	const validationFailureWarnedUris = new Set<string>();

	function validatePassive(doc: vscode.TextDocument): void {
		if (!isAtomizeToolingDocument(doc)) {
			diagnostics.delete(doc.uri);
			clearRunState(doc.uri);
			if (!isAtomizeSchemaDocument(doc)) {
				removeSchemaUri(doc.uri.toString());
			}
			validationFailureWarnedUris.delete(doc.uri.toString());
			return;
		}
		void probeCli(getConfiguredCliPath()).then(probe => {
			if (probe.available) void checkForCliUpdate(getConfiguredCliPath(), probe.version);
		});
		runDiagnosticValidation(
			doc,
			diagnostics,
			getConfiguredCliPath(),
			() => { validationFailureWarnedUris.delete(doc.uri.toString()); },
			() => { showValidationRunnerFailure(doc, true); },
		);
	}

	async function checkDirtyDocument(doc: vscode.TextDocument): Promise<boolean> {
		if (!doc.isDirty) return true;
		const selection = await vscode.window.showWarningMessage(
			'Atomize validation uses saved file content. Save this file before validating?',
			'Save and Validate',
			'Validate Saved Version',
			'Cancel',
		);
		if (selection === 'Cancel' || selection === undefined) return false;
		if (selection === 'Save and Validate') {
			const saved = await doc.save();
			if (!saved) return false;
		}
		return true;
	}

	function showValidationRunnerFailure(doc: vscode.TextDocument, throttle: boolean): void {
		const key = doc.uri.toString();
		if (throttle) {
			if (validationFailureWarnedUris.has(key)) return;
			validationFailureWarnedUris.add(key);
		}
		void vscode.window.showWarningMessage(
			'Atomize validation could not complete. Existing diagnostics were left unchanged.',
		);
	}

	// Seed the schema URI set for already-open Atomize YAML documents.
	const warnedUris = new Set<string>();

	function trackDocument(doc: vscode.TextDocument): void {
		if (isAtomizeSchemaDocument(doc)) addSchemaUri(doc.uri.toString());
		else removeSchemaUri(doc.uri.toString());
	}

	function normalizeDocumentLanguage(doc: vscode.TextDocument): void {
		handleDocument(doc, (document, languageId) => {
			addSchemaUri(doc.uri.toString());
			void vscode.languages.setTextDocumentLanguage(document as vscode.TextDocument, languageId);
		});
	}

	function warnContentOnlyDetected(doc: vscode.TextDocument): void {
		const key = doc.uri.toString();
		if (warnedUris.has(key) || !isContentOnlyDetected(doc)) return;
		warnedUris.add(key);
		const shortName = vscode.workspace.asRelativePath(doc.uri);
		void vscode.window.showWarningMessage(
			`"${shortName}" looks like an Atomize template but does not have a persistent Atomize marker. Rename it to .atomize.yaml or add a # atomize-yaml modeline to enable full IDE support.`,
			'Rename to .atomize.yaml',
			'Add modeline',
		).then(async selection => {
			if (selection === 'Add modeline') {
				const edit = new vscode.WorkspaceEdit();
				edit.insert(doc.uri, new vscode.Position(0, 0), '# atomize-yaml\n');
				const applied = await vscode.workspace.applyEdit(edit);
				if (applied) {
					addSchemaUri(doc.uri.toString());
					await vscode.languages.setTextDocumentLanguage(doc, 'yaml');
				}
			} else if (selection === 'Rename to .atomize.yaml') {
				const newPath = doc.uri.path.replace(/\.ya?ml$/i, '.atomize.yaml');
				const newUri = doc.uri.with({ path: newPath });
				await vscode.workspace.fs.rename(doc.uri, newUri);
				removeSchemaUri(doc.uri.toString());
				addSchemaUri(newUri.toString());
				const renamedDoc = await vscode.workspace.openTextDocument(newUri);
				await vscode.window.showTextDocument(renamedDoc, vscode.window.activeTextEditor?.viewColumn);
				await vscode.languages.setTextDocumentLanguage(renamedDoc, 'yaml');
			}
		});
	}

	for (const doc of vscode.workspace.textDocuments) {
		warnContentOnlyDetected(doc);
		normalizeDocumentLanguage(doc);
		trackDocument(doc);
	}

	ctx.subscriptions.push(
		diagnostics,

		vscode.workspace.onDidOpenTextDocument(doc => {
			warnContentOnlyDetected(doc);
			normalizeDocumentLanguage(doc);
			trackDocument(doc);
		}),
		vscode.workspace.onDidSaveTextDocument(doc => {
			normalizeDocumentLanguage(doc);
			trackDocument(doc);
			validatePassive(doc);
		}),
		vscode.workspace.onDidCloseTextDocument(doc => {
			diagnostics.delete(doc.uri);
			clearRunState(doc.uri);
			validationFailureWarnedUris.delete(doc.uri.toString());
			removeSchemaUri(doc.uri.toString());
		}),

		vscode.languages.registerCodeLensProvider(
			[{ language: 'yaml' }, { language: 'atomize-yaml' }],
			new AtomizeCodeLensProvider(),
		),

		registerValidateCommand({
			diagnostics,
			onValidationSuccess: uri => { validationFailureWarnedUris.delete(uri.toString()); },
			onRunnerFailure: doc => showValidationRunnerFailure(doc, false),
			showCliUnavailable: showCliUnavailableMessage,
			checkDirtyDocument,
			checkForCliUpdate,
		}),

		vscode.commands.registerCommand('atomize.preview', async (uri?: vscode.Uri) => {
			const doc = uri
				? vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString())
				: vscode.window.activeTextEditor?.document;
			if (!doc) return;
			if (!await checkDirtyDocument(doc)) return;

			const cliPath = getConfiguredCliPath();
			const probe = await probeCli(cliPath);
			if (!probe.available) {
				await showCliUnavailableMessage(cliPath, 'Atomize CLI not found. Install it to enable validation and preview.');
				return;
			}
			void checkForCliUpdate(cliPath, probe.version);
			await PreviewPanel.open(doc.uri, cliPath);
		}),

		vscode.commands.registerCommand('atomize.manageProfiles', async () => {
			const cliPath = getConfiguredCliPath();
			await manageProfiles(cliPath, async () => {
				const probe = await probeCli(cliPath);
				if (!probe.available) {
					await showCliUnavailableMessage(cliPath, 'Atomize CLI not found. Install it to manage profiles.');
					return false;
				}
				void checkForCliUpdate(cliPath, probe.version);
				return true;
			});
		}),

		vscode.commands.registerCommand('atomize.openSettings', () =>
			vscode.commands.executeCommand('workbench.action.openSettings', '@ext:sppg2001.atomize'),
		),
	);
}

export function deactivate(): void {
	AtomizePanel.dispose();
	PreviewPanel.dispose();
}
