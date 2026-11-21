import * as vscode from 'vscode';
import { AtomizeCodeLensProvider } from './authoring/codelens-provider.js';
import {
	handleDocument,
	isAtomizeSchemaDocument,
	isAtomizeToolingDocument,
	isContentOnlyDetected,
	isMixinDocument,
} from './authoring/language-detection.js';
import { addSchemaUri, registerYamlSchemaContributor, removeSchemaUri } from './authoring/yaml-schema-contributor.js';
import type { CatalogItemProvider } from './catalog/browse-catalog-command.js';
import type { ResolvedTemplateProvider } from './catalog/show-resolved-template-command.js';
import { once, registerLazyCommands } from './lazy.js';
import { AtomizePanel } from './panel.js';
import { ProfileStore } from './profiles/profile-store.js';
import { SchemaReferencePanel } from './schema-reference/schema-reference-panel.js';
import { type ExtensionTelemetry, initExtensionTelemetry, telemetry } from './telemetry/extension-telemetry.js';

// Everything that pulls in atomize-core, zod, azure-devops-node-api or yaml is loaded on first use
// (dynamic import), not when the bundle loads: those evaluate for tens of milliseconds and most
// sessions never need them. Only language detection, CodeLens, the YAML schema contributor and
// the panels' disposal stay on the activation path.
type GeneratePanelModule = typeof import('./generate/generate-panel.js');
type LivePreviewPanelModule = typeof import('./preview/live-preview-panel.js');
type MockPreviewPanelModule = typeof import('./preview/mock-preview-panel.js');
type DiagnosticsModule = typeof import('./validation/diagnostics.js');

let generatePanelModule: GeneratePanelModule | undefined;
let livePreviewPanelModule: LivePreviewPanelModule | undefined;
let mockPreviewPanelModule: MockPreviewPanelModule | undefined;
let activeTelemetry: ExtensionTelemetry | undefined;

/** `session_started` waits this long after activation, so its consent read and import stay off the startup path. */
const SESSION_STARTED_DELAY_MS = 5_000;

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
		'Atomize: the atomize.cliPath, atomize.cli.installCommand, and atomize.cli.autoCheckUpdates settings are no longer used. Atomize now runs directly in the extension, with no CLI install required. You can remove them from your settings.',
	);
}

export function activate(ctx: vscode.ExtensionContext): void {
	// Start registering the schema contributor before anything else to minimise the
	// timing window between extension activation and the YAML LS calling requestSchema.
	// Not awaited: it waits for redhat.vscode-yaml to activate and start its language
	// server, which would otherwise count toward Atomize's activation time and hold
	// back every command and provider registered below.
	void registerYamlSchemaContributor(ctx);

	void maybeShowDeprecatedCliSettingsNotice(ctx);

	// Wiring only: the consent file is read, and atomize-telemetry loaded, on the first event.
	const extensionTelemetry = initExtensionTelemetry({
		atomizeVersion: String(ctx.extension?.packageJSON?.version ?? '0.0.0'),
		isVscodeTelemetryEnabled: () => vscode.env.isTelemetryEnabled,
		onDidChangeVscodeTelemetryEnabled: listener => vscode.env.onDidChangeTelemetryEnabled(listener),
		loadPackage: once(() => import('@sppg2001/atomize-telemetry')),
		ui: {
			showInformationMessage: (message, ...items) => vscode.window.showInformationMessage(message, ...items),
			showWarningMessage: (message, options, ...items) => vscode.window.showWarningMessage(message, options, ...items),
			openExternal: url => vscode.env.openExternal(vscode.Uri.parse(url)),
		},
	});
	activeTelemetry = extensionTelemetry;
	const sessionStartedTimer = setTimeout(() => extensionTelemetry.sessionStarted(), SESSION_STARTED_DELAY_MS);

	const store = new ProfileStore(ctx);
	const getCredentialResolver = once(async () => {
		const { createCredentialResolver } = await import('./profiles/credential-resolver.js');
		return createCredentialResolver(store);
	});
	let diagnosticsModule: DiagnosticsModule | undefined;
	const loadDiagnostics = once(async () => {
		diagnosticsModule = await import('./validation/diagnostics.js');
		return diagnosticsModule;
	});
	let catalogProviders: { resolved: ResolvedTemplateProvider; items: CatalogItemProvider; resolvedScheme: string; itemScheme: string } | undefined;

	const diagnostics = vscode.languages.createDiagnosticCollection('atomize');
	const validationFailureWarnedUris = new Set<string>();

	function validatePassive(doc: vscode.TextDocument): void {
		if (!isAtomizeToolingDocument(doc)) {
			diagnostics.delete(doc.uri);
			diagnosticsModule?.clearRunState(doc.uri);
			if (!isAtomizeSchemaDocument(doc)) {
				removeSchemaUri(doc.uri.toString());
			}
			validationFailureWarnedUris.delete(doc.uri.toString());
			return;
		}
		loadDiagnostics().then(
			({ runDiagnosticValidation }) => runDiagnosticValidation(
				doc,
				diagnostics,
				() => { validationFailureWarnedUris.delete(doc.uri.toString()); },
				() => { showValidationRunnerFailure(doc, true); },
			),
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

	function updateSchemaReferenceContext(closedDocument?: vscode.TextDocument): void {
		void vscode.commands.executeCommand(
			'setContext',
			'atomize.schemaDocumentPaths',
			vscode.workspace.textDocuments
				.filter(doc => doc !== closedDocument && isAtomizeSchemaDocument(doc))
				.map(doc => doc.uri.path),
		);
	}

	function trackDocument(doc: vscode.TextDocument): void {
		updateSchemaReferenceContext();
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
		// Renaming or adding a modeline only makes sense for a file on disk; virtual documents such as
		// the resolved-template and catalog views have no marker to add.
		if (doc.uri.scheme !== 'file') return;
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
		validatePassive(doc);
	}

	ctx.subscriptions.push(
		diagnostics,

		vscode.workspace.onDidOpenTextDocument(doc => {
			warnContentOnlyDetected(doc);
			normalizeDocumentLanguage(doc);
			trackDocument(doc);
			validatePassive(doc);
		}),
		vscode.workspace.onDidSaveTextDocument(doc => {
			normalizeDocumentLanguage(doc);
			trackDocument(doc);
			validatePassive(doc);
		}),
		vscode.workspace.onDidChangeTextDocument(() => updateSchemaReferenceContext()),

		vscode.workspace.onDidCloseTextDocument(doc => {
			updateSchemaReferenceContext(doc);
			diagnostics.delete(doc.uri);
			diagnosticsModule?.clearRunState(doc.uri);
			validationFailureWarnedUris.delete(doc.uri.toString());
			removeSchemaUri(doc.uri.toString());
			if (catalogProviders) {
				if (doc.uri.scheme === catalogProviders.resolvedScheme) catalogProviders.resolved.delete(doc.uri);
				if (doc.uri.scheme === catalogProviders.itemScheme) catalogProviders.items.delete(doc.uri);
			}
		}),

		vscode.languages.registerCodeLensProvider(
			[{ language: 'yaml' }, { language: 'atomize-yaml' }],
			new AtomizeCodeLensProvider(),
		),

		vscode.languages.registerCodeActionsProvider(
			[{ language: 'yaml' }, { language: 'atomize-yaml' }],
			lazyCodeActionProvider(),
			{ providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
		),

		vscode.languages.registerDocumentLinkProvider(
			[{ language: 'yaml' }, { language: 'atomize-yaml' }],
			lazyDocumentLinkProvider(),
		),

		registerLazyCommands(['atomize.draftTemplateWithAI'], async () => {
			const [{ registerDraftTemplateCommand }, credentialResolver] = await Promise.all([
				import('./ai/draft-template-command.js'),
				getCredentialResolver(),
			]);
			return registerDraftTemplateCommand({ store, credentialResolver });
		}),
		registerLazyCommands(
			['atomize.improveTemplateWithAI', 'atomize.acceptImprovement', 'atomize.saveImprovementAsNew', 'atomize.rejectImprovement'],
			async () => {
				const [{ registerImproveTemplateCommand }, credentialResolver] = await Promise.all([
					import('./ai/improve-template-command.js'),
					getCredentialResolver(),
				]);
				return registerImproveTemplateCommand({ checkDirtyDocument, isRunnableTemplate, store, credentialResolver });
			},
		),

		registerLazyCommands(['atomize.validate'], async () => {
			const [{ registerValidateCommand }, credentialResolver] = await Promise.all([
				import('./validation/validate-command.js'),
				getCredentialResolver(),
			]);
			return registerValidateCommand({
				diagnostics,
				store,
				credentialResolver,
				onValidationSuccess: uri => { validationFailureWarnedUris.delete(uri.toString()); },
				onRunnerFailure: doc => showValidationRunnerFailure(doc, false),
				checkDirtyDocument,
			});
		}),

		vscode.commands.registerCommand('atomize.preview', telemetry.instrument('preview', { variant: 'mock-story' }, async (run, uri?: vscode.Uri) => {
			const doc = uri
				? vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString())
				: vscode.window.activeTextEditor?.document;
			if (!doc) return run.cancelled();
			if (!isRunnableTemplate(doc)) return run.cancelled();
			if (!await checkDirtyDocument(doc, 'preview')) return run.cancelled();
			mockPreviewPanelModule ??= await import('./preview/mock-preview-panel.js');
			await mockPreviewPanelModule.PreviewPanel.open(doc.uri);
		})),

		vscode.commands.registerCommand('atomize.livePreview', telemetry.instrument('preview', { variant: 'live' }, async (run, uri?: vscode.Uri) => {
			const doc = uri
				? vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString())
				: vscode.window.activeTextEditor?.document;
			if (!doc) return run.cancelled();
			if (!isRunnableTemplate(doc)) return run.cancelled();
			if (!await checkDirtyDocument(doc, 'preview')) return run.cancelled();
			livePreviewPanelModule ??= await import('./preview/live-preview-panel.js');
			await livePreviewPanelModule.LivePreviewPanel.open(doc.uri, store, await getCredentialResolver());
		})),

		vscode.commands.registerCommand('atomize.generate', async (uri?: vscode.Uri) => {
			const doc = uri
				? vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString())
				: vscode.window.activeTextEditor?.document;
			if (!doc) return;
			if (!isRunnableTemplate(doc)) return;
			if (!await checkDirtyDocument(doc, 'generate')) return;
			generatePanelModule ??= await import('./generate/generate-panel.js');
			await generatePanelModule.GeneratePanel.open(doc.uri, store, await getCredentialResolver());
		}),

		// Create only the Tasks each picked Story is missing, after a cancelled or stalled run (#331).
		vscode.commands.registerCommand('atomize.finishPartlyCreatedStories', async (uri?: vscode.Uri) => {
			const doc = uri
				? vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString())
				: vscode.window.activeTextEditor?.document;
			if (!doc) return;
			if (!isRunnableTemplate(doc)) return;
			if (!await checkDirtyDocument(doc, 'generate')) return;
			generatePanelModule ??= await import('./generate/generate-panel.js');
			await generatePanelModule.GeneratePanel.open(doc.uri, store, await getCredentialResolver(), { resume: true });
		}),

		vscode.commands.registerCommand('atomize.manageProfiles', async () => {
			const [{ manageProfiles }, credentialResolver] = await Promise.all([
				import('./profiles/profile-management.js'),
				getCredentialResolver(),
			]);
			await manageProfiles(store, credentialResolver);
		}),

		{ dispose: () => clearTimeout(sessionStartedTimer) },
		extensionTelemetry,
		vscode.commands.registerCommand('atomize.telemetry.enable', () => extensionTelemetry.enable('command')),
		vscode.commands.registerCommand('atomize.telemetry.disable', () => extensionTelemetry.disable()),
		vscode.commands.registerCommand('atomize.telemetry.showStatus', telemetry.instrument('telemetry.status', {}, () => extensionTelemetry.showStatus())),
		vscode.commands.registerCommand('atomize.telemetry.requestDeletion', () => extensionTelemetry.requestDeletion()),

		vscode.commands.registerCommand('atomize.openSettings', () =>
			vscode.commands.executeCommand('workbench.action.openSettings', '@ext:atomize.atomize'),
		),

		registerLazyCommands(['atomize.openSchemaReference'], async () => {
			const { registerOpenSchemaReferenceCommand } = await import('./schema-reference/open-schema-reference-command.js');
			return registerOpenSchemaReferenceCommand(ctx);
		}),

		registerLazyCommands(['atomize.browseFields'], async () => {
			const [{ registerBrowseFieldsCommand }, credentialResolver] = await Promise.all([
				import('./platform-metadata/browse-fields-command.js'),
				getCredentialResolver(),
			]);
			return registerBrowseFieldsCommand({ store, credentialResolver });
		}),
		registerLazyCommands(['atomize.browseQueries'], async () => {
			const [{ registerBrowseQueriesCommand }, credentialResolver] = await Promise.all([
				import('./platform-metadata/browse-queries-command.js'),
				getCredentialResolver(),
			]);
			return registerBrowseQueriesCommand({ store, credentialResolver });
		}),

		// The catalog commands share two content providers, so they load together.
		registerLazyCommands(['atomize.browseCatalog', 'atomize.installToCatalog', 'atomize.showResolvedTemplate'], async () => {
			const [browse, install, show] = await Promise.all([
				import('./catalog/browse-catalog-command.js'),
				import('./catalog/install-to-catalog-command.js'),
				import('./catalog/show-resolved-template-command.js'),
			]);
			const resolved = new show.ResolvedTemplateProvider();
			const items = new browse.CatalogItemProvider();
			const registration = vscode.Disposable.from(
				resolved,
				items,
				browse.registerBrowseCatalogCommand({ provider: items }),
				install.registerInstallToCatalogCommand({ checkDirtyDocument }),
				vscode.workspace.registerTextDocumentContentProvider(browse.CATALOG_ITEM_SCHEME, items),
				vscode.workspace.registerTextDocumentContentProvider(show.RESOLVED_TEMPLATE_SCHEME, resolved),
				show.registerShowResolvedTemplateCommand({ provider: resolved, checkDirtyDocument }),
			);
			catalogProviders = { resolved, items, resolvedScheme: show.RESOLVED_TEMPLATE_SCHEME, itemScheme: browse.CATALOG_ITEM_SCHEME };
			return registration;
		}),
	);
}

/** Quick fixes need yaml, so it loads only once Atomize has reported a diagnostic the document can be fixed with. */
function lazyCodeActionProvider(): vscode.CodeActionProvider {
	const load = once(async () => {
		const { ValidationCodeActionProvider } = await import('./authoring/validation-code-action-provider.js');
		return new ValidationCodeActionProvider();
	});
	return {
		async provideCodeActions(document, range, context) {
			if (!isAtomizeToolingDocument(document) || !context.diagnostics.some(d => d.source === 'atomize')) return [];
			return (await load()).provideCodeActions(document, range, context);
		},
	};
}

/** Field links need yaml, so it loads only for Atomize documents. */
function lazyDocumentLinkProvider(): vscode.DocumentLinkProvider {
	const load = once(async () => {
		const { SchemaReferenceLinkProvider } = await import('./schema-reference/schema-reference-authoring.js');
		return new SchemaReferenceLinkProvider();
	});
	return {
		async provideDocumentLinks(document) {
			if (!isAtomizeSchemaDocument(document)) return [];
			return (await load()).provideDocumentLinks(document);
		},
	};
}

export async function deactivate(): Promise<void> {
	await activeTelemetry?.flush(300);
	SchemaReferencePanel.dispose();
	AtomizePanel.dispose();
	mockPreviewPanelModule?.PreviewPanel.dispose();
	livePreviewPanelModule?.LivePreviewPanel.dispose();
	generatePanelModule?.GeneratePanel.dispose();
}
