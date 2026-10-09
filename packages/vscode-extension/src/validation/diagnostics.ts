import { requireProjectMetadataReader, requireSavedQueryReader } from '@sppg2001/atomize-core/platforms/capabilities';
import type { TemplateVerificationOptions } from '@sppg2001/atomize-core/templates/template-verification';
import { verifyTemplate } from '@sppg2001/atomize-core/templates/template-verification';
import type { ValidationWarning } from '@sppg2001/atomize-core/templates/validator';
import * as vscode from 'vscode';
import { resolveDocumentPath } from '../catalog/catalog-document-path.js';
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

	runValidationInProcess(resolveDocumentPath(doc.uri), request.profile, request.credentialResolver).then(result => {
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
					getEstimationDefaults: () => adapter.getEstimationDefaults(),
					getWorkItemTypes: adapter.getWorkItemTypes?.bind(adapter),
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
	const lines = doc.getText().split('\n');
	const segments = Array.from(path.matchAll(/\["([^"]+)"\]|\[(\d+)\]|([^.[\]]+)/g))
		.map(m => m[1] ?? m[2] ?? m[3] ?? '')
		.filter(Boolean);

	// tasks.N... / tasks[N]... — search only the Nth task's block, so an issue on one task
	// never lands on the same key in another task.
	if (segments[0] === 'tasks' && /^\d+$/.test(segments[1] ?? '')) {
		const block = findTaskBlock(Number(segments[1]), lines);
		if (block) {
			return findKeyRange(segments.slice(2), lines, block.start, block.end)
				?? lineRange(lines, block.start, line => line.search(/\S/));
		}
	}

	return findKeyRange(segments, lines, 0, lines.length)
		?? new vscode.Range(0, 0, 0, doc.lineAt(0).text.length);
}

/** The deepest named segment's key line within [start, end), or undefined when absent. */
function findKeyRange(segments: string[], lines: string[], start: number, end: number): vscode.Range | undefined {
	for (let i = segments.length - 1; i >= 0; i--) {
		const seg = segments[i];
		if (seg === undefined || /^\d+$/.test(seg)) continue;

		const keyPattern = new RegExp(`^\\s*(?:-\\s*)?${escapeRegex(seg)}\\s*:`);
		for (let lineIdx = start; lineIdx < end; lineIdx++) {
			const line = lines[lineIdx];
			if (line !== undefined && keyPattern.test(line)) {
				return lineRange(lines, lineIdx, text => text.indexOf(seg));
			}
		}
	}
	return undefined;
}

function lineRange(lines: string[], lineIdx: number, startColumn: (line: string) => number): vscode.Range {
	const line = lines[lineIdx] ?? '';
	const col = startColumn(line);
	return new vscode.Range(lineIdx, col >= 0 ? col : 0, lineIdx, line.length);
}

/** The lines of the Nth task list item: from its `- ` line up to the next item or the end of `tasks:`. */
function findTaskBlock(index: number, lines: string[]): { start: number; end: number } | undefined {
	let inTasks = false;
	let itemIndent = -1;
	let taskCount = -1;
	let start = -1;

	for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
		const line = lines[lineIdx] ?? '';
		if (!inTasks) {
			if (/^tasks\s*:/.test(line)) inTasks = true;
			continue;
		}
		if (line.trim() === '' || /^\s*#/.test(line)) continue;
		// Non-indented non-empty line exits the tasks block
		if (/^\S/.test(line)) return start === -1 ? undefined : { start, end: lineIdx };

		const indent = line.search(/\S/);
		if (/^\s*-/.test(line) && (itemIndent === -1 || indent === itemIndent)) {
			itemIndent = indent;
			taskCount++;
			if (taskCount === index) start = lineIdx;
			else if (taskCount === index + 1) return { start, end: lineIdx };
		}
	}

	return start === -1 ? undefined : { start, end: lines.length };
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const DEPRECATED_CODES = new Set(['DEPRECATED_MINIMUM_TASK_POINTS', 'DUPLICATE_MINIMUM_TASK_ESTIMATE']);

export function makeDiagnostic(
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
		if (DEPRECATED_CODES.has(code)) d.tags = [vscode.DiagnosticTag.Deprecated];
	}
	return d;
}
