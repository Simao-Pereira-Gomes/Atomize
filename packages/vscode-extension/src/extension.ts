import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import * as vscode from 'vscode';
import { handleDocument } from './language-detection.js';

const INSTALL_URL = 'https://www.npmjs.com/package/@sppg2001/atomize';
const ATOMIZE_SCHEMA_URI = 'atomize-schema://template';

// Layer 1 filename patterns mirrored from package.json contributes.languages.filenamePatterns.
// Used as a first-open fallback in requestSchema before language detection has run.
const LAYER1_PATTERNS = [
	/\/templates\/.*\.ya?ml$/i,
	/\/atomize\/.*\.ya?ml$/i,
	/\.atomize\.ya?ml$/i,
];

interface YamlSchemaContributorAPI {
	registerContributor(
		schema: string,
		requestSchema: (resource: string) => string | undefined,
		requestSchemaContent: (uri: string) => string | undefined,
		label?: string,
	): boolean;
}

let cliWarningShown = false;

function checkCliAvailable(): Promise<boolean> {
	return new Promise(resolve => {
		const proc = spawn('atomize', ['--version']);
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

	api.registerContributor(
		ATOMIZE_SCHEMA_URI,
		(resource: string) => {
			// Fast path: language detection has already promoted this document.
			const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === resource);
			if (doc?.languageId === 'atomize-yaml') return ATOMIZE_SCHEMA_URI;

			// First-open fallback: match Layer 1 filename patterns before language
			// detection has run. Covers the common case without leaking onto
			// arbitrary YAML files outside Atomize directory conventions.
			if (LAYER1_PATTERNS.some(re => re.test(resource))) return ATOMIZE_SCHEMA_URI;

			return undefined;
		},
		(uri: string) => uri === ATOMIZE_SCHEMA_URI ? schemaContent : undefined,
	);
}

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
	const found = await checkCliAvailable();
	if (!found && !cliWarningShown) {
		cliWarningShown = true;
		const selection = await vscode.window.showWarningMessage(
			'Atomize CLI not found. Install it to enable validation, preview, and testing.',
			'Install',
		);
		if (selection === 'Install') {
			await vscode.env.openExternal(vscode.Uri.parse(INSTALL_URL));
		}
	}

	const setLanguage = (doc: unknown, lang: string) =>
		vscode.languages.setTextDocumentLanguage(doc as vscode.TextDocument, lang);

	for (const doc of vscode.workspace.textDocuments) {
		handleDocument(doc, setLanguage);
	}

	ctx.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument(doc => handleDocument(doc, setLanguage)),
		vscode.workspace.onDidSaveTextDocument(doc => handleDocument(doc, setLanguage)),
	);

	await registerYamlSchemaContributor(ctx);
}

export function deactivate(): void {}
