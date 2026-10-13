import * as vscode from 'vscode';
import { isAtomizeSchemaDocument, isMixinDocument } from '../authoring/language-detection.js';
import { yamlFieldRanges } from '../authoring/yaml-field-ranges.js';
import { schemaReferenceLocation } from './schema-reference-location.js';

function referenceCommandUri(doc: vscode.TextDocument, offset: number): vscode.Uri {
	const args = encodeURIComponent(JSON.stringify([doc.uri.toString(), offset]));
	return vscode.Uri.parse(`command:atomize.openSchemaReference?${args}`);
}

export class SchemaReferenceLinkProvider implements vscode.DocumentLinkProvider {
	provideDocumentLinks(doc: vscode.TextDocument): vscode.DocumentLink[] {
		if (!isAtomizeSchemaDocument(doc)) return [];
		const tab = isMixinDocument(doc) ? 'mixin' : 'template';
		return yamlFieldRanges(doc.getText()).flatMap(field => {
			if (!schemaReferenceLocation(field.path, tab)) return [];
			const range = new vscode.Range(doc.positionAt(field.start), doc.positionAt(field.end));
			const link = new vscode.DocumentLink(range, referenceCommandUri(doc, field.start));
			link.tooltip = 'Open Schema Reference';
			return [link];
		});
	}
}
