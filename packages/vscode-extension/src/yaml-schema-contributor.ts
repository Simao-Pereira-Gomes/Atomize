import { readFileSync } from 'node:fs';
import * as vscode from 'vscode';
import { isAtomizeSchemaDocument, LAYER1_PATTERNS } from './language-detection.js';

interface YamlSchemaContributorAPI {
	registerContributor(
		schema: string,
		requestSchema: (resource: string) => string | undefined,
		requestSchemaContent: (uri: string) => string | undefined,
		label?: string,
	): boolean;
}

const schemaEnabledUris = new Set<string>();

export function addSchemaUri(uri: string): void {
	schemaEnabledUris.add(uri);
}

export function removeSchemaUri(uri: string): void {
	schemaEnabledUris.delete(uri);
}

export async function registerYamlSchemaContributor(ctx: vscode.ExtensionContext): Promise<void> {
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
			if (schemaEnabledUris.has(resource)) return schemaFileUri;

			const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === resource);
			if (doc && isAtomizeSchemaDocument(doc)) {
				schemaEnabledUris.add(resource);
				return schemaFileUri;
			}

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
