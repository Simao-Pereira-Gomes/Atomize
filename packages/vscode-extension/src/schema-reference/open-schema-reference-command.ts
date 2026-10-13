import * as vscode from 'vscode';
import { isAtomizeSchemaDocument, isMixinDocument } from '../authoring/language-detection.js';
import { yamlCursorPath } from '../authoring/yaml-cursor-path.js';
import { getSchemaReferenceOpenMode } from '../config/atomize-configuration.js';
import { schemaReferenceLocation } from './schema-reference-location.js';
import { SchemaReferencePanel } from './schema-reference-panel.js';

export function registerOpenSchemaReferenceCommand(ctx: vscode.ExtensionContext): vscode.Disposable {
	return vscode.commands.registerCommand('atomize.openSchemaReference', (resource?: vscode.Uri | string, offset?: number): Promise<void> => {
		const uri = typeof resource === 'string' ? vscode.Uri.parse(resource) : resource;
		const editor = vscode.window.activeTextEditor;
		const doc = uri
			? vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString())
			: editor?.document;
		const mode = getSchemaReferenceOpenMode(doc?.uri);
		if (!doc || !isAtomizeSchemaDocument(doc)) {
			return SchemaReferencePanel.open(ctx, undefined, mode);
		}
		const tab = isMixinDocument(doc) ? 'mixin' : 'template';
		const cursorOffset = typeof offset === 'number' ? offset
			: editor?.document === doc ? doc.offsetAt(editor.selection.active) : undefined;
		const path = cursorOffset === undefined ? undefined : yamlCursorPath(doc.getText(), cursorOffset);
		return SchemaReferencePanel.open(ctx, { tab, permalink: schemaReferenceLocation(path, tab) }, mode);
	});
}
