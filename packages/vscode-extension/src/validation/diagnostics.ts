import { requireProjectMetadataReader, requireSavedQueryReader } from '@sppg2001/atomize-core/platforms/capabilities';
import type { TemplateVerificationOptions } from '@sppg2001/atomize-core/templates/template-verification';
import { verifyTemplate } from '@sppg2001/atomize-core/templates/template-verification';
import type { ValidationWarning } from '@sppg2001/atomize-core/templates/validator';
import * as vscode from 'vscode';
import { createTemplateLibrary } from '../core-library.js';
import type { CredentialResolver } from '../profiles/credential-resolver.js';

export type { ValidationError, ValidationResult, ValidationWarning } from '@sppg2001/atomize-core/templates/validator';
import type { ValidationResult } from '@sppg2001/atomize-core/templates/validator';

interface RunState {
	running: boolean;
	pending: ValidationRequest | undefined;
}

const runStates = new Map<string, RunState>();

interface BaseValidationRequest {
	doc: vscode.TextDocument;
	diagnostics: vscode.DiagnosticCollection;
	profile?: string;
	credentialResolver?: CredentialResolver;
	onError?: (error: Error) => void;
}

interface DiagnosticValidationRequest extends BaseValidationRequest {
	kind: 'diagnostics';
	onSuccess?: () => void;
}

interface ReportValidationRequest extends BaseValidationRequest {
	kind: 'report';
	onResult: (result: ValidationResult) => void;
}

type ValidationRequest = DiagnosticValidationRequest | ReportValidationRequest;

function getRunState(key: string): RunState {
	let state = runStates.get(key);
	if (!state) {
		state = { running: false, pending: undefined };
		runStates.set(key, state);
	}
	return state;
}

export function clearRunState(uri: vscode.Uri): void {
	runStates.delete(uri.toString());
}

export function runDiagnosticValidation(
	doc: vscode.TextDocument,
	diagnostics: vscode.DiagnosticCollection,
	onSuccess?: () => void,
	onError?: (error: Error) => void,
): void {
	runValidation({ doc, diagnostics, kind: 'diagnostics', onSuccess, onError });
}

export function runReportValidation(
	doc: vscode.TextDocument,
	diagnostics: vscode.DiagnosticCollection,
	onResult: (result: ValidationResult) => void,
	onError?: (error: Error) => void,
	profile?: string,
	credentialResolver?: CredentialResolver,
): void {
	runValidation({ doc, diagnostics, profile, credentialResolver, kind: 'report', onResult, onError });
}

function runValidation(request: ValidationRequest): void {
	const { doc, diagnostics, kind, onError } = request;

	const key = doc.uri.toString();
	const state = getRunState(key);

	if (state.running) {
		state.pending = request;
		return;
	}

	state.running = true;
	state.pending = undefined;

	runValidationInProcess(doc.uri.fsPath, request.profile, request.credentialResolver).then(result => {
		state.running = false;

		const items = [
			...result.errors.map(e =>
				makeDiagnostic(e.path, e.message, vscode.DiagnosticSeverity.Error, doc),
			),
			...result.warnings.map(w =>
				makeDiagnostic(w.path, w.message, vscode.DiagnosticSeverity.Warning, doc, w.code),
			),
		];
		diagnostics.set(doc.uri, items);

		if (kind === 'report') {
			request.onResult(result);
		} else {
			request.onSuccess?.();
		}

		runPendingValidation(state);
	}).catch((error: Error) => {
		state.running = false;
		onError?.(error);
		runPendingValidation(state);
	});
}

function runPendingValidation(state: RunState): void {
	const pending = state.pending;
	if (!pending) return;
	state.pending = undefined;
	runValidation(pending);
}

async function runValidationInProcess(
	filePath: string,
	profile: string | undefined,
	credentialResolver: CredentialResolver | undefined,
): Promise<ValidationResult> {
	const { template } = await createTemplateLibrary().loadSource(filePath);

	const connectionWarnings: ValidationWarning[] = [];
	let project: TemplateVerificationOptions['project'];

	if (profile && credentialResolver) {
		try {
			const adapter = await credentialResolver.resolveByName(profile);
			const metadataReader = requireProjectMetadataReader(adapter);
			const savedQueryReader = requireSavedQueryReader(adapter);
			project = {
				mode: 'online',
				platform: {
					getFieldSchemas: workItemType => metadataReader.getFieldSchemas(workItemType),
					listSavedQueries: folder => savedQueryReader.listSavedQueries(folder),
				},
			};
		} catch (err) {
			project = { mode: 'online' };
			connectionWarnings.push({
				path: 'template',
				message: `Could not validate project references against ADO: ${err instanceof Error ? err.message : String(err)}`,
			});
		}
	} else {
		project = { mode: 'offline' };
	}

	const result = await verifyTemplate(template, { project });
	result.warnings.push(...connectionWarnings);
	return result;
}

export function resolvePathToRange(path: string, doc: vscode.TextDocument): vscode.Range {
	// tasks[N] — point to the Nth task list item so each warning has a unique range.
	const taskMatch = path.match(/^tasks\[(\d+)\]$/);
	if (taskMatch) {
		return resolveTaskItemRange(Number(taskMatch[1]), doc);
	}

	const segments = Array.from(path.matchAll(/\["([^"]+)"\]|\[(\d+)\]|([^.[\]]+)/g))
		.map(m => m[1] ?? m[2] ?? m[3] ?? '')
		.filter(Boolean);

	for (let i = segments.length - 1; i >= 0; i--) {
		const seg = segments[i];
		if (seg === undefined || /^\d+$/.test(seg)) continue;

		const lines = doc.getText().split('\n');
		const keyPattern = new RegExp(`^\\s*(?:-\\s*)?${escapeRegex(seg)}\\s*:`);
		for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
			const line = lines[lineIdx];
			if (line === undefined) continue;
			if (keyPattern.test(line)) {
				const col = line.indexOf(seg);
				return new vscode.Range(lineIdx, col >= 0 ? col : 0, lineIdx, line.length);
			}
		}
	}

	// Fallback: first line
	return new vscode.Range(0, 0, 0, doc.lineAt(0).text.length);
}

function resolveTaskItemRange(index: number, doc: vscode.TextDocument): vscode.Range {
	const lines = doc.getText().split('\n');
	let inTasks = false;
	let taskCount = -1;

	for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
		const line = lines[lineIdx] ?? '';
		if (!inTasks) {
			if (/^tasks\s*:/.test(line)) inTasks = true;
			continue;
		}
		if (/^\s*-/.test(line)) {
			taskCount++;
			if (taskCount === index) {
				const col = line.search(/\S/);
				return new vscode.Range(lineIdx, col >= 0 ? col : 0, lineIdx, line.length);
			}
		}
		// Non-indented non-empty line exits the tasks block
		if (/^\S/.test(line) && line.trim() !== '') break;
	}

	return new vscode.Range(0, 0, 0, doc.lineAt(0).text.length);
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makeDiagnostic(
	path: string,
	message: string,
	severity: vscode.DiagnosticSeverity,
	doc: vscode.TextDocument,
	code?: string,
): vscode.Diagnostic {
	const range = resolvePathToRange(path, doc);
	const d = new vscode.Diagnostic(range, message, severity);
	d.source = 'atomize';
	if (code !== undefined) {
		d.code = code;
	}
	return d;
}
