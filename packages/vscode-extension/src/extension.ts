import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import * as vscode from 'vscode';
import {
	handleDocument,
	isAtomizeDocument,
	isAtomizeSchemaDocument,
	isContentOnlyDetected,
	isAtomizeToolingDocument,
	LAYER1_PATTERNS,
} from './language-detection.js';
import { AtomizeCodeLensProvider } from './codelens-provider.js';
import { clearRunState, runDiagnosticValidation, runReportValidation } from './diagnostics.js';
import { AtomizePanel } from './panel.js';
import { PreviewPanel } from './preview-panel.js';
import { renderValidationHtml } from './validation-html.js';
import { extendedEnv } from './env-utils.js';
import {
	buildVersionArgs,
	checkForCliUpdate,
	DEFAULT_CLI_PATH,
	fetchNpmLatestVersion,
	normalizeCliPath,
	normalizeInstallCommand,
	UPDATE_CHECK_CACHE_KEY,
	type CliUpdateCache,
} from './cli-provider.js';

interface YamlSchemaContributorAPI {
	registerContributor(
		schema: string,
		requestSchema: (resource: string) => string | undefined,
		requestSchemaContent: (uri: string) => string | undefined,
		label?: string,
	): boolean;
}

interface AdoProfileJson {
	name: string;
	platform: 'azure-devops';
	isDefault: boolean;
	organizationUrl: string;
	project: string;
	team: string;
}

let cliWarningShown = false;

// URIs of documents that should receive the Atomize YAML schema.
// Populated on document open/save so requestSchema can return the schema URI synchronously.
const schemaEnabledUris = new Set<string>();

function getConfiguredCliPath(): string {
	return normalizeCliPath(vscode.workspace.getConfiguration('atomize').get('cliPath'));
}

function getConfiguredInstallCommand(): string {
	return normalizeInstallCommand(vscode.workspace.getConfiguration('atomize').get('cli.installCommand'));
}

function getAutoCheckUpdates(): boolean {
	return vscode.workspace.getConfiguration('atomize').get('cli.autoCheckUpdates', true);
}

interface CliProbeResult {
	available: boolean;
	version?: string;
}

function fetchAdoProfiles(cliPath: string): Promise<AdoProfileJson[] | null> {
	return new Promise(resolve => {
		const proc = spawn(cliPath, ['auth', 'list', '--json'], { shell: false, env: extendedEnv() });
		let stdout = '';
		proc.stdout.on('data', chunk => { stdout += chunk.toString(); });
		proc.on('close', () => {
			try {
				const all = JSON.parse(stdout) as unknown[];
				resolve(all.filter((p): p is AdoProfileJson =>
					typeof p === 'object' && p !== null && (p as Record<string, unknown>)['platform'] === 'azure-devops',
				));
			} catch {
				resolve(null);
			}
		});
		proc.on('error', () => resolve(null));
	});
}

function probeCli(cliPath: string): Promise<CliProbeResult> {
	return new Promise(resolve => {
		const proc = spawn(cliPath, buildVersionArgs(), { shell: false, env: extendedEnv() });
		let output = '';
		proc.stdout.on('data', chunk => { output += chunk.toString(); });
		proc.stderr.on('data', chunk => { output += chunk.toString(); });
		proc.on('close', code => resolve({ available: code === 0, version: output.trim() }));
		proc.on('error', () => resolve({ available: false }));
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
			// Fast path: already confirmed as a schema-enabled Atomize document.
			if (schemaEnabledUris.has(resource)) return schemaFileUri;

			// Check open documents first (covers most cases after the first open).
			const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === resource);
			if (doc && isAtomizeSchemaDocument(doc)) {
				schemaEnabledUris.add(resource);
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
					if (isAtomizeSchemaDocument(fakeDoc)) {
						schemaEnabledUris.add(resource);
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

	const initialCliPath = getConfiguredCliPath();
	const initialProbe = await probeCli(initialCliPath);

	if (!initialProbe.available && !cliWarningShown) {
		cliWarningShown = true;
		await showCliUnavailableMessage(initialCliPath, 'Atomize CLI not found. Install it to enable validation, preview, and testing.');
	}

	const diagnostics = vscode.languages.createDiagnosticCollection('atomize');
	const validationFailureWarnedUris = new Set<string>();
	let updateCheckStarted = false;

	async function openAtomizeSettings(): Promise<void> {
		await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:sppg2001.atomize');
	}

	function runInstallCommand(): void {
		const terminal = vscode.window.createTerminal({ name: 'Atomize CLI' });
		terminal.show();
		terminal.sendText(getConfiguredInstallCommand(), true);
	}

	async function promptRecheckAfterInstall(): Promise<void> {
		const selection = await vscode.window.showInformationMessage(
			'Atomize CLI install command started in the terminal.',
			'Re-check',
			'Dismiss',
		);
		if (selection === 'Re-check') {
			const probe = await probeCli(getConfiguredCliPath());
			if (probe.available) {
				void vscode.window.showInformationMessage('Atomize CLI is available.');
			} else {
				await showCliUnavailableMessage(getConfiguredCliPath(), 'Atomize CLI is still not available.');
			}
		}
	}

	async function maybeCheckForCliUpdate(cliPath: string, version: string | undefined): Promise<void> {
		if (updateCheckStarted) return;
		updateCheckStarted = true;
		const result = await checkForCliUpdate({
			cliPath,
			autoCheckUpdates: getAutoCheckUpdates(),
			installedVersion: version,
			now: Date.now(),
			cache: ctx.globalState.get<CliUpdateCache>(UPDATE_CHECK_CACHE_KEY),
			fetchLatestVersion: fetchNpmLatestVersion,
		});
		if (!result) return;

		await ctx.globalState.update(UPDATE_CHECK_CACHE_KEY, result.cache);
		if (!result.updateAvailable || !result.latestVersion) return;

		const selection = await vscode.window.showInformationMessage(
			`A newer Atomize CLI is available (${result.latestVersion}).`,
			'Update',
			'Dismiss',
		);
		if (selection === 'Update') {
			runInstallCommand();
		}
	}

	function validatePassive(doc: vscode.TextDocument): void {
		if (!isAtomizeToolingDocument(doc)) {
			diagnostics.delete(doc.uri);
			clearRunState(doc.uri);
			if (!isAtomizeSchemaDocument(doc)) {
				schemaEnabledUris.delete(doc.uri.toString());
			}
			validationFailureWarnedUris.delete(doc.uri.toString());
			return;
		}
		void probeCli(getConfiguredCliPath()).then(probe => {
			if (probe.available) void maybeCheckForCliUpdate(getConfiguredCliPath(), probe.version);
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

	async function showCliUnavailableMessage(cliPath: string, defaultMessage: string): Promise<void> {
		if (cliPath === DEFAULT_CLI_PATH) {
			const selection = await vscode.window.showWarningMessage(defaultMessage, 'Install', 'Open Settings', 'Dismiss');
			if (selection === 'Install') {
				runInstallCommand();
				await promptRecheckAfterInstall();
			} else if (selection === 'Open Settings') {
				await openAtomizeSettings();
			}
			return;
		}

		const selection = await vscode.window.showWarningMessage(
			`Configured Atomize CLI path could not be executed: ${cliPath}`,
			'Open Settings',
			'Dismiss',
		);
		if (selection === 'Open Settings') {
			await vscode.commands.executeCommand('workbench.action.openSettings', 'atomize.cliPath');
		}
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
		if (isAtomizeSchemaDocument(doc)) schemaEnabledUris.add(doc.uri.toString());
		else schemaEnabledUris.delete(doc.uri.toString());
	}

	function normalizeDocumentLanguage(doc: vscode.TextDocument): void {
		handleDocument(doc, (document, languageId) => {
			schemaEnabledUris.add(doc.uri.toString());
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
					schemaEnabledUris.add(doc.uri.toString());
					await vscode.languages.setTextDocumentLanguage(doc, 'yaml');
				}
			} else if (selection === 'Rename to .atomize.yaml') {
				const newPath = doc.uri.path.replace(/\.ya?ml$/i, '.atomize.yaml');
				const newUri = doc.uri.with({ path: newPath });
				await vscode.workspace.fs.rename(doc.uri, newUri);
				schemaEnabledUris.delete(doc.uri.toString());
				schemaEnabledUris.add(newUri.toString());
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
			schemaEnabledUris.delete(doc.uri.toString());
		}),

		vscode.languages.registerCodeLensProvider(
			[{ language: 'yaml' }, { language: 'atomize-yaml' }],
			new AtomizeCodeLensProvider(),
		),

		vscode.commands.registerCommand('atomize.validate', async (uri?: vscode.Uri) => {
			const doc = uri
				? vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString())
				: vscode.window.activeTextEditor?.document;
			if (!doc || !isAtomizeDocument(doc)) return;
			if (!await checkDirtyDocument(doc)) return;

			const cliPath = getConfiguredCliPath();
			const probe = await probeCli(cliPath);
			if (!probe.available) {
				await showCliUnavailableMessage(cliPath, 'Atomize CLI not found. Install it to enable validation and preview.');
				return;
			}

			let profile: string | undefined;
			const adoProfiles = await fetchAdoProfiles(cliPath);

			if (adoProfiles && adoProfiles.length > 0) {
				type ProfileItem = vscode.QuickPickItem & { profileName: string | undefined };
				const profileItems: ProfileItem[] = [...adoProfiles]
					.sort((a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)))
					.map(p => ({
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
			}

			void maybeCheckForCliUpdate(cliPath, probe.version);
			const mode = profile ? 'Online' : 'Offline';
			runReportValidation(doc, diagnostics, cliPath, result => {
				validationFailureWarnedUris.delete(doc.uri.toString());
				const fileName = vscode.workspace.asRelativePath(doc.uri);
				AtomizePanel.show(`Atomize: ${fileName} (${mode})`, renderValidationHtml(result, fileName));
			}, () => { showValidationRunnerFailure(doc, false); }, profile);
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
			void maybeCheckForCliUpdate(cliPath, probe.version);
			await PreviewPanel.open(doc.uri, cliPath);
		}),

		vscode.commands.registerCommand('atomize.openSettings', openAtomizeSettings),
	);
}

export function deactivate(): void {
	AtomizePanel.dispose();
	PreviewPanel.dispose();
}
