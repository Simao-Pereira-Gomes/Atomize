import * as vscode from 'vscode';
import { isAtomizeToolingDocument } from './language-detection.js';
import {
	fixMissingTaskId,
	fixSavedQueryWithStructuredFilter,
	fixSingleLineFieldWithNewlines,
	type PlainRange,
	type TextEdit,
} from './validation-code-actions.js';

const FIXABLE_CODE = {
	MISSING_TASK_ID: 'MISSING_TASK_ID',
	SAVED_QUERY_WITH_STRUCTURED_FILTER: 'SAVED_QUERY_WITH_STRUCTURED_FILTER',
	SINGLE_LINE_FIELD_WITH_NEWLINES: 'SINGLE_LINE_FIELD_WITH_NEWLINES',
} as const;

type EditFactory = (docText: string, range: PlainRange, data: unknown) => TextEdit[] | null;

const FACTORIES = new Map<string, EditFactory>([
	[FIXABLE_CODE.MISSING_TASK_ID, fixMissingTaskId],
	[FIXABLE_CODE.SAVED_QUERY_WITH_STRUCTURED_FILTER, fixSavedQueryWithStructuredFilter],
	[FIXABLE_CODE.SINGLE_LINE_FIELD_WITH_NEWLINES, fixSingleLineFieldWithNewlines],
]);

function actionLabel(code: string): string {
	switch (code) {
		case FIXABLE_CODE.MISSING_TASK_ID:
			return 'Atomize: Add id field derived from task title';
		case FIXABLE_CODE.SAVED_QUERY_WITH_STRUCTURED_FILTER:
			return 'Atomize: Remove conflicting structured filter fields';
		case FIXABLE_CODE.SINGLE_LINE_FIELD_WITH_NEWLINES:
			return 'Atomize: Strip newlines from single-line field value';
		default:
			return `Atomize: Fix ${code}`;
	}
}

export class ValidationCodeActionProvider implements vscode.CodeActionProvider {
	static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

	provideCodeActions(
		document: vscode.TextDocument,
		_range: vscode.Range | vscode.Selection,
		context: vscode.CodeActionContext,
	): vscode.CodeAction[] {
		if (!isAtomizeToolingDocument(document)) return [];

		const docText = document.getText();
		const actions: vscode.CodeAction[] = [];

		for (const diagnostic of context.diagnostics) {
			if (diagnostic.source !== 'atomize') continue;
			const code = typeof diagnostic.code === 'string' ? diagnostic.code : undefined;
			if (!code) continue;

			const factory = FACTORIES.get(code);
			if (!factory) continue;

			const plainRange: PlainRange = {
				start: { line: diagnostic.range.start.line, character: diagnostic.range.start.character },
				end: { line: diagnostic.range.end.line, character: diagnostic.range.end.character },
			};

			const edits = factory(docText, plainRange, undefined);
			if (!edits || edits.length === 0) continue;

			const workspaceEdit = new vscode.WorkspaceEdit();
			for (const edit of edits) {
				workspaceEdit.replace(
					document.uri,
					new vscode.Range(edit.startLine, edit.startCharacter, edit.endLine, edit.endCharacter),
					edit.newText,
				);
			}

			const action = new vscode.CodeAction(actionLabel(code), vscode.CodeActionKind.QuickFix);
			action.edit = workspaceEdit;
			action.diagnostics = [diagnostic];
			action.isPreferred = true;
			actions.push(action);
		}

		return actions;
	}
}
