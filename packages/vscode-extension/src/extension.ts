import * as vscode from 'vscode';
import { AtomizeCodeLensProvider } from './authoring/codelens-provider.js';
import {
	handleDocument,
	isAtomizeSchemaDocument,
	isAtomizeToolingDocument,
	isMixinDocument,
	isContentOnlyDetected,
} from './authoring/language-detection.js';
import { ValidationCodeActionProvider } from './authoring/validation-code-action-provider.js';
import { addSchemaUri, registerYamlSchemaContributor, removeSchemaUri } from './authoring/yaml-schema-contributor.js';
import { CATALOG_ITEM_SCHEME, CatalogItemProvider, registerBrowseCatalogCommand } from './catalog/browse-catalog-command.js';
import { RESOLVED_TEMPLATE_SCHEME, ResolvedTemplateProvider, registerShowResolvedTemplateCommand } from './catalog/show-resolved-template-command.js';
import { GeneratePanel } from './generate/generate-panel.js';
import { AtomizePanel } from './panel.js';
import { registerBrowseFieldsCommand } from './platform-metadata/browse-fields-command.js';
import { registerBrowseQueriesCommand } from './platform-metadata/browse-queries-command.js';
import { LivePreviewPanel } from './preview/live-preview-panel.js';
import { PreviewPanel } from './preview/mock-preview-panel.js';
import { createCredentialResolver } from './profiles/credential-resolver.js';
import { manageProfiles } from './profiles/profile-management.js';
import { ProfileStore } from './profiles/profile-store.js';
import { clearRunState, runDiagnosticValidation } from './validation/diagnostics.js';
import { registerValidateCommand } from './validation/validate-command.js';

const DEPRECATED_CLI_SETTINGS_NOTICE_KEY = 'atomize.deprecatedCliSettingsNoticeShown';
const DEPRECATED_CLI_SETTING_KEYS = ['cliPath', 'cli.installCommand', 'cli.autoCheckUpdates'];

function hasLingeringDeprecatedCliSetting(): boolean {
	const config = vscode.workspace.getConfiguration('atomize');
	return DEPRECATED_CLI_SETTING_KEYS.some(key => {
		const inspected = config.inspect(key);
		return inspected !== undefined && (
			inspected.globalValue !== undefined
			|| inspected.workspaceValue !== undefined
			|| inspected.workspaceFolderValue !== undefined
		);
	});
}

async function maybeShowDeprecatedCliSettingsNotice(ctx: vscode.ExtensionContext): Promise<void> {
	if (ctx.globalState.get<boolean>(DEPRECATED_CLI_SETTINGS_NOTICE_KEY)) return;
	if (!hasLingeringDeprecatedCliSetting()) return;
	await ctx.globalState.update(DEPRECATED_CLI_SETTINGS_NOTICE_KEY, true);
	void vscode.window.showInformationMessage(
		'Atomize: the atomize.cliPath, atomize.cli.installCommand, and atomize.cli.autoCheckUpdates settings are no longer used — Atomize now runs directly in the extension, with no CLI install required. You can remove them from your settings.',
	);
}

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
	// Register schema contributor before anything else to minimise the timing
	// window between extension activation and the YAML LS calling requestSchema.
	await registerYamlSchemaContributor(ctx);

	void maybeShowDeprecatedCliSettingsNotice(ctx);

	const store = new ProfileStore(ctx);
	const credentialResolver = createCredentialResolver(store);

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
		runDiagnosticValidation(
			doc,
			diagnostics,
			() => { validationFailureWarnedUris.delete(doc.uri.toString()); },
			() => { showValidationRunnerFailure(doc, true); },
		);
	}

	async function checkDirtyDocument(doc: vscode.TextDocument, verb: string): Promise<boolean> {
		if (!doc.isDirty) return true;
		const Verb = verb.charAt(0).toUpperCase() + verb.slice(1);
		const selection = await vscode.window.showWarningMessage(
			`Atomize uses saved file content. Save this file before ${verb}ing?`,
			`Save and ${Verb}`,
			`${Verb} Saved Version`,
			'Cancel',
		);
		if (selection === 'Cancel' || selection === undefined) return false;
		if (selection === `Save and ${Verb}`) {
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

	function isRunnableTemplate(doc: vscode.TextDocument): boolean {
		if (!isMixinDocument(doc)) return true;
		void vscode.window.showInformationMessage(
			'Atomize: Mixins are reusable partial Templates and cannot be previewed, generated, or resolved on their own.',
		);
		return false;
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

	const resolvedTemplateProvider = new ResolvedTemplateProvider();
	const catalogItemProvider = new CatalogItemProvider();

	ctx.subscriptions.push(
		diagnostics,
		resolvedTemplateProvider,
		catalogItemProvider,

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
			if (doc.uri.scheme === RESOLVED_TEMPLATE_SCHEME) resolvedTemplateProvider.delete(doc.uri);
			if (doc.uri.scheme === CATALOG_ITEM_SCHEME) catalogItemProvider.delete(doc.uri);
		}),

		vscode.languages.registerCodeLensProvider(
			[{ language: 'yaml' }, { language: 'atomize-yaml' }],
			new AtomizeCodeLensProvider(),
		),

		vscode.languages.registerCodeActionsProvider(
			[{ language: 'yaml' }, { language: 'atomize-yaml' }],
			new ValidationCodeActionProvider(),
			{ providedCodeActionKinds: ValidationCodeActionProvider.providedCodeActionKinds },
		),

		registerValidateCommand({
			diagnostics,
			store,
			credentialResolver,
			onValidationSuccess: uri => { validationFailureWarnedUris.delete(uri.toString()); },
			onRunnerFailure: doc => showValidationRunnerFailure(doc, false),
			checkDirtyDocument,
		}),

		vscode.commands.registerCommand('atomize.preview', async (uri?: vscode.Uri) => {
			const doc = uri
				? vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString())
				: vscode.window.activeTextEditor?.document;
			if (!doc) return;
			if (!isRunnableTemplate(doc)) return;
			if (!await checkDirtyDocument(doc, 'preview')) return;
			await PreviewPanel.open(doc.uri);
		}),

		vscode.commands.registerCommand('atomize.livePreview', async (uri?: vscode.Uri) => {
			const doc = uri
				? vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString())
				: vscode.window.activeTextEditor?.document;
			if (!doc) return;
			if (!isRunnableTemplate(doc)) return;
			if (!await checkDirtyDocument(doc, 'preview')) return;
			await LivePreviewPanel.open(doc.uri, store, credentialResolver);
		}),

		vscode.commands.registerCommand('atomize.generate', async (uri?: vscode.Uri) => {
			const doc = uri
				? vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString())
				: vscode.window.activeTextEditor?.document;
			if (!doc) return;
			if (!isRunnableTemplate(doc)) return;
			if (!await checkDirtyDocument(doc, 'generate')) return;
			await GeneratePanel.open(doc.uri, store, credentialResolver);
		}),

		vscode.commands.registerCommand('atomize.manageProfiles', async () => {
			await manageProfiles(store, credentialResolver);
		}),

		vscode.commands.registerCommand('atomize.openSettings', () =>
			vscode.commands.executeCommand('workbench.action.openSettings', '@ext:atomize.atomize'),
		),

		registerBrowseFieldsCommand({ store, credentialResolver }),
		registerBrowseQueriesCommand({ store, credentialResolver }),
		registerBrowseCatalogCommand({ provider: catalogItemProvider }),
		vscode.workspace.registerTextDocumentContentProvider(CATALOG_ITEM_SCHEME, catalogItemProvider),
		vscode.workspace.registerTextDocumentContentProvider(RESOLVED_TEMPLATE_SCHEME, resolvedTemplateProvider),
		registerShowResolvedTemplateCommand({
			provider: resolvedTemplateProvider,
			checkDirtyDocument,
		}),
	);
}

export function deactivate(): void {
	AtomizePanel.dispose();
	PreviewPanel.dispose();
	LivePreviewPanel.dispose();
	GeneratePanel.dispose();
}
