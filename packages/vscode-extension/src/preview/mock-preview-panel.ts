import { inspectTemplate, runPreview } from '@sppg2001/atomize-core/templates/template-inspector';
import * as vscode from 'vscode';
import { resolveDocumentPath } from '../catalog/catalog-document-path.js';
import { getPreviewLayout } from '../config/atomize-configuration.js';
import { createTemplateLibrary } from '../core-library.js';
import {
	type InspectField,
	renderPreviewForm,
	renderPreviewResults,
	type StoredValues,
} from './mock-preview-html.js';

async function inspectFile(fileUri: vscode.Uri): Promise<InspectField[]> {
	const { template } = await createTemplateLibrary().loadSource(resolveDocumentPath(fileUri));
	return inspectTemplate(template).fields;
}

async function previewFile(fileUri: vscode.Uri, mockStory: string) {
	const { template } = await createTemplateLibrary().loadSource(resolveDocumentPath(fileUri));
	return runPreview(template, mockStory);
}

function buildMockStory(fields: InspectField[], values: Record<string, unknown>): string {
	const story: Record<string, unknown> = {};
	const customFields: Record<string, unknown> = {};
	for (const field of fields) {
		const value = values[field.name];
		if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) continue;
		if (field.type === 'unknown') {
			customFields[field.name] = value;
		} else {
			story[field.name] = value;
		}
	}
	if (Object.keys(customFields).length > 0) story.customFields = customFields;
	return JSON.stringify(story);
}

interface SubmitMessage { type: 'submit'; values: Record<string, unknown>; }
interface BackMessage { type: 'back'; }
interface SwitchModeMessage { type: 'switchMode'; mode: 'default' | 'compact'; }
type WebviewMessage = SubmitMessage | BackMessage | SwitchModeMessage;

export class PreviewPanel {
	private static _instance: PreviewPanel | undefined;
	private static readonly _storedValues = new Map<string, StoredValues>();

	private _panel: vscode.WebviewPanel;
	private _fileUri: vscode.Uri;
	private _fields: InspectField[];
	private _mode: 'default' | 'compact';
	private _lastResult: Awaited<ReturnType<typeof previewFile>> | undefined;

	private constructor(
		panel: vscode.WebviewPanel,
		fileUri: vscode.Uri,
		fields: InspectField[],
		mode: 'default' | 'compact',
	) {
		this._panel = panel;
		this._fileUri = fileUri;
		this._fields = fields;
		this._mode = mode;

		panel.onDidDispose(() => { PreviewPanel._instance = undefined; });
		panel.webview.onDidReceiveMessage((msg: unknown) => { void this._handleMessage(msg); });

		this._showForm();
	}

	static async open(fileUri: vscode.Uri): Promise<void> {
		const mode = getPreviewLayout(fileUri);

		let fields: InspectField[];
		try {
			fields = await inspectFile(fileUri);
		} catch (err) {
			await vscode.window.showWarningMessage(
				`Atomize: Failed to inspect template — ${err instanceof Error ? err.message : String(err)}`,
			);
			return;
		}

		const fileName = vscode.workspace.asRelativePath(fileUri);

		if (PreviewPanel._instance) {
			const inst = PreviewPanel._instance;
			inst._fileUri = fileUri;
			inst._fields = fields;
			inst._mode = mode;
			inst._lastResult = undefined;
			inst._panel.title = `Atomize: ${fileName} (Preview)`;
			inst._showForm();
			inst._panel.reveal(vscode.ViewColumn.Beside, true);
		} else {
			const panel = vscode.window.createWebviewPanel(
				'atomize.preview',
				`Atomize: ${fileName} (Preview)`,
				{ viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
				{ enableScripts: true, retainContextWhenHidden: true },
			);
			PreviewPanel._instance = new PreviewPanel(panel, fileUri, fields, mode);
		}
	}

	private _showForm(error?: string): void {
		const stored = PreviewPanel._storedValues.get(this._fileUri.toString()) ?? {};
		const fileName = vscode.workspace.asRelativePath(this._fileUri);
		this._panel.webview.html = renderPreviewForm(this._fields, stored, fileName, error);
	}

	private _showResults(result: Awaited<ReturnType<typeof previewFile>>): void {
		const fileName = vscode.workspace.asRelativePath(this._fileUri);
		this._lastResult = result;
		this._panel.webview.html = renderPreviewResults(result, this._mode, fileName);
	}

	private async _handleMessage(msg: unknown): Promise<void> {
		if (typeof msg !== 'object' || msg === null) return;
		const message = msg as WebviewMessage;

		if (message.type === 'submit') {
			PreviewPanel._storedValues.set(this._fileUri.toString(), message.values as StoredValues);
			const mockStory = buildMockStory(this._fields, message.values);
			try {
				const result = await previewFile(this._fileUri, mockStory);
				this._showResults(result);
			} catch (err) {
				this._showForm(err instanceof Error ? err.message : String(err));
			}
		} else if (message.type === 'back') {
			this._lastResult = undefined;
			this._showForm();
		} else if (message.type === 'switchMode') {
			this._mode = message.mode;
			if (this._lastResult) this._showResults(this._lastResult);
		}
	}

	static dispose(): void {
		PreviewPanel._instance?._panel.dispose();
	}
}
