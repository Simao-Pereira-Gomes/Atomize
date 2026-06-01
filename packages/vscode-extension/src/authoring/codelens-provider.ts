import * as vscode from 'vscode';
import { isAtomizeToolingDocument } from './language-detection.js';

export class AtomizeCodeLensProvider implements vscode.CodeLensProvider {
	provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
		if (!isAtomizeToolingDocument(document)) return [];

		const range = new vscode.Range(0, 0, 0, 0);
		return [
			new vscode.CodeLens(range, {
				title: 'Atomize: Validate',
				command: 'atomize.validate',
				arguments: [document.uri],
			}),
			new vscode.CodeLens(range, {
				title: 'Atomize: Preview (Mock)',
				command: 'atomize.preview',
				arguments: [document.uri],
			}),
			new vscode.CodeLens(range, {
				title: 'Atomize: Preview (Live)',
				command: 'atomize.livePreview',
				arguments: [document.uri],
			}),
			new vscode.CodeLens(range, {
				title: 'Atomize: Generate',
				command: 'atomize.generate',
				arguments: [document.uri],
			}),
		];
	}
}
