import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import * as vscode from 'vscode';
import {
	handleDocument,
	isAtomizeDocument,
	isContentOnlyDetected,
	isAtomizeToolingDocument,
	LAYER1_PATTERNS,
} from './language-detection.js';
import { AtomizeCodeLensProvider } from './codelens-provider.js';
import { clearRunState, runValidation } from './diagnostics.js';
import { AtomizePanel } from './panel.js';
import { renderValidationHtml } from './validation-html.js';

const INSTALL_URL = 'https://www.npmjs.com/package/@sppg2001/atomize';

interface YamlSchemaContributorAPI {
	registerContributor(
		schema: string,
		requestSchema: (resource: string) => string | undefined,
		requestSchemaContent: (uri: string) => string | undefined,
		label?: string,
	): boolean;
}

let cliAvailable = false;
let cliWarningShown = false;

// URIs of documents detected as Atomize templates at runtime (Layer 2/3 structural detection).
// Populated on document open/change so requestSchema can return the schema URI synchronously.
const detectedAtomizeUris = new Set<string>();

function extendedEnv(): NodeJS.ProcessEnv {
	const home = process.env.HOME ?? '';
	const extra = [
		`${home}/.bun/bin`,
		`${home}/.npm-global/bin`,
		'/usr/local/bin',
		'/opt/homebrew/bin',
	].join(':');
	return { ...process.env, PATH: `${extra}:${process.env.PATH ?? ''}` };
}

function checkCliAvailable(): Promise<boolean> {
	return new Promise(resolve => {
		const proc = spawn('atomize', ['--version'], { shell: true, env: extendedEnv() });
		proc.on('close', code => resolve(code === 0));
		proc.on('error', () => resolve(false));
	});
}

async function registerYamlSchemaContributor(ctx: vscode.ExtensionContext): Promise<void> {
	const ext = vscode.extensions.getExtension('redhat.vscode-yaml');
	if (!ext) return;

	let api: YamlSchemaContributorAPI | undefined;
	try {
		api = (await ext.activate()) as YamlSchemaContributorAPI | undefined;
	} catch {
		return;
	}
	if (typeof api?.registerContributor !== 'function') return;

	const schemaPath = vscode.Uri.joinPath(ctx.extensionUri, 'schemas', 'atomize-template.schema.json');
	let schemaContent: string;
	try {
		schemaContent = readFileSync(schemaPath.fsPath, 'utf8');
	} catch {
		return;
	}

	// Use a file:// URI so the YAML language server resolves it natively.
	// Custom URI schemes (atomize-schema://) have unreliable hover/completion support.
	const schemaFileUri = schemaPath.toString();

	api.registerContributor(
		schemaFileUri,
		(resource: string) => {
			// Fast path: already confirmed as a tooling-enabled Atomize document.
			if (detectedAtomizeUris.has(resource)) return schemaFileUri;

			// Check open documents first (covers most cases after the first open).
			const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === resource);
			if (doc && isAtomizeToolingDocument(doc)) {
				detectedAtomizeUris.add(resource);
				return schemaFileUri;
			}

			// Layer 1 filename patterns — always reliable, no content read needed.
			if (LAYER1_PATTERNS.some(re => re.test(resource))) return schemaFileUri;

			// Disk-read fallback: the YAML LS can call requestSchema before
			// onDidOpenTextDocument fires, so the document may not be in memory yet.
			// Reading synchronously lets us run structural detection anyway.
			if (resource.startsWith('file://')) {
				try {
					const fsPath = vscode.Uri.parse(resource).fsPath;
					const rawContent = readFileSync(fsPath, 'utf8');
					const fakeDoc = { languageId: 'yaml', fileName: fsPath, getText: () => rawContent };
					if (isAtomizeToolingDocument(fakeDoc)) {
						detectedAtomizeUris.add(resource);
						return schemaFileUri;
					}
				} catch {
					// File unreadable — fall through.
				}
			}

			return undefined;
		},
		(uri: string) => uri === schemaFileUri ? schemaContent : undefined,
	);
}

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
	// Register schema contributor before anything else to minimise the timing
	// window between extension activation and the YAML LS calling requestSchema.
	await registerYamlSchemaContributor(ctx);

	cliAvailable = await checkCliAvailable();

	if (!cliAvailable && !cliWarningShown) {
		cliWarningShown = true;
		const selection = await vscode.window.showWarningMessage(
			'Atomize CLI not found. Install it to enable validation, preview, and testing.',
			'Install',
		);
		if (selection === 'Install') {
			await vscode.env.openExternal(vscode.Uri.parse(INSTALL_URL));
		}
	}

	const diagnostics = vscode.languages.createDiagnosticCollection('atomize');
	const validationFailureWarnedUris = new Set<string>();

	function validatePassive(doc: vscode.TextDocument): void {
		if (!isAtomizeToolingDocument(doc)) {
			diagnostics.delete(doc.uri);
			clearRunState(doc.uri);
			detectedAtomizeUris.delete(doc.uri.toString());
			validationFailureWarnedUris.delete(doc.uri.toString());
			return;
		}
		runValidation(
			doc,
			diagnostics,
			cliAvailable,
			() => { validationFailureWarnedUris.delete(doc.uri.toString()); },
			() => { showValidationRunnerFailure(doc, true); },
		);
	}

	function validateWithReport(doc: vscode.TextDocument): void {
		if (!isAtomizeDocument(doc)) return;
		runValidation(doc, diagnostics, cliAvailable, result => {
			validationFailureWarnedUris.delete(doc.uri.toString());
			const fileName = vscode.workspace.asRelativePath(doc.uri);
			AtomizePanel.show(`Atomize: ${fileName}`, renderValidationHtml(result, fileName));
		}, () => { showValidationRunnerFailure(doc, false); });
	}

	function showInstallBanner(): void {
		void vscode.window.showWarningMessage(
			'Atomize CLI not found. Install it to enable validation and preview.',
			'Install',
		).then(selection => {
			if (selection === 'Install') {
				void vscode.env.openExternal(vscode.Uri.parse(INSTALL_URL));
			}
		});
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

	// Seed the detected-URI set for already-open tooling-enabled Atomize documents.
	const warnedUris = new Set<string>();

	function trackDocument(doc: vscode.TextDocument): void {
		if (isAtomizeToolingDocument(doc)) detectedAtomizeUris.add(doc.uri.toString());
	}

	function promoteDocumentLanguage(doc: vscode.TextDocument): void {
		handleDocument(doc, (document, languageId) => {
			detectedAtomizeUris.add(doc.uri.toString());
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
			'Add modeline',
			'Rename to .atomize.yaml',
		).then(async selection => {
			if (selection === 'Add modeline') {
				const edit = new vscode.WorkspaceEdit();
				edit.insert(doc.uri, new vscode.Position(0, 0), '# atomize-yaml\n');
				const applied = await vscode.workspace.applyEdit(edit);
				if (applied) {
					detectedAtomizeUris.add(doc.uri.toString());
					await vscode.languages.setTextDocumentLanguage(doc, 'atomize-yaml');
				}
			} else if (selection === 'Rename to .atomize.yaml') {
				const newPath = doc.uri.path.replace(/\.ya?ml$/i, '.atomize.yaml');
				const newUri = doc.uri.with({ path: newPath });
				await vscode.workspace.fs.rename(doc.uri, newUri);
				detectedAtomizeUris.delete(doc.uri.toString());
				detectedAtomizeUris.add(newUri.toString());
				const renamedDoc = await vscode.workspace.openTextDocument(newUri);
				await vscode.window.showTextDocument(renamedDoc, vscode.window.activeTextEditor?.viewColumn);
				await vscode.languages.setTextDocumentLanguage(renamedDoc, 'atomize-yaml');
			}
		});
	}

	for (const doc of vscode.workspace.textDocuments) {
		warnContentOnlyDetected(doc);
		promoteDocumentLanguage(doc);
		trackDocument(doc);
	}

	ctx.subscriptions.push(
		diagnostics,

		vscode.workspace.onDidOpenTextDocument(doc => {
			warnContentOnlyDetected(doc);
			promoteDocumentLanguage(doc);
			trackDocument(doc);
		}),
		vscode.workspace.onDidSaveTextDocument(doc => {
			promoteDocumentLanguage(doc);
			trackDocument(doc);
			validatePassive(doc);
		}),
		vscode.workspace.onDidCloseTextDocument(doc => {
			diagnostics.delete(doc.uri);
			clearRunState(doc.uri);
			validationFailureWarnedUris.delete(doc.uri.toString());
			detectedAtomizeUris.delete(doc.uri.toString());
		}),

		vscode.languages.registerCodeLensProvider(
			[{ language: 'yaml' }, { language: 'atomize-yaml' }],
			new AtomizeCodeLensProvider(),
		),

		vscode.commands.registerCommand('atomize.validate', async (uri?: vscode.Uri) => {
			if (!cliAvailable) { showInstallBanner(); return; }
			const doc = uri
				? vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString())
				: vscode.window.activeTextEditor?.document;
			if (!doc || !isAtomizeDocument(doc)) return;

			if (doc.isDirty) {
				const selection = await vscode.window.showWarningMessage(
					'Atomize validation uses saved file content. Save this file before validating?',
					'Save and Validate',
					'Validate Saved Version',
					'Cancel',
				);
				if (selection === 'Cancel' || selection === undefined) return;
				if (selection === 'Save and Validate') {
					const saved = await doc.save();
					if (!saved) return;
				}
			}

			validateWithReport(doc);
		}),

		vscode.commands.registerCommand('atomize.preview', (uri?: vscode.Uri) => {
			if (!cliAvailable) { showInstallBanner(); return; }
			const doc = uri
				? vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString())
				: vscode.window.activeTextEditor?.document;
			if (!doc) return;
			void vscode.window.showInformationMessage(
				`Atomize: Preview (Mock) is coming soon for ${vscode.workspace.asRelativePath(doc.uri)}.`,
			);
		}),
	);
}

export function deactivate(): void {
	AtomizePanel.dispose();
}
