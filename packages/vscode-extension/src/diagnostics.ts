import { spawn } from 'node:child_process';
import * as vscode from 'vscode';
import { buildValidateArgs } from './cli-provider.js';
import { extendedEnv } from './env-utils.js';

export interface ValidationError {
	path: string;
	message: string;
	code: string;
	suggestion?: string;
}

export interface ValidationWarning {
	path: string;
	message: string;
	suggestion?: string;
	code?: string;
	nonBlocking?: boolean;
}

export interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
	warnings: ValidationWarning[];
	mode: string;
}

interface RunState {
	running: boolean;
	pending: ValidationRequest | undefined;
}

const runStates = new Map<string, RunState>();

interface BaseValidationRequest {
	doc: vscode.TextDocument;
	diagnostics: vscode.DiagnosticCollection;
	cliPath: string;
	profile?: string;
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
	cliPath: string,
	onSuccess?: () => void,
	onError?: (error: Error) => void,
): void {
	runValidation({
		doc,
		diagnostics,
		cliPath,
		kind: 'diagnostics',
		onSuccess,
		onError,
	});
}

export function runReportValidation(
	doc: vscode.TextDocument,
	diagnostics: vscode.DiagnosticCollection,
	cliPath: string,
	onResult: (result: ValidationResult) => void,
	onError?: (error: Error) => void,
	profile?: string,
): void {
	runValidation({
		doc,
		diagnostics,
		cliPath,
		profile,
		kind: 'report',
		onResult,
		onError,
	});
}

function runValidation(request: ValidationRequest): void {
	const { doc, diagnostics, cliPath, kind, onError } = request;

	const key = doc.uri.toString();
	const state = getRunState(key);

	if (state.running) {
		state.pending = request;
		return;
	}

	state.running = true;
	state.pending = undefined;

	spawnValidation(cliPath, doc.uri.fsPath, request.profile).then(result => {
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

function spawnValidation(cliPath: string, filePath: string, profile?: string): Promise<ValidationResult> {
	return new Promise((resolve, reject) => {
		const proc = spawn(cliPath, buildValidateArgs(filePath, profile), { shell: false, env: extendedEnv() });
		let stdout = '';
		let stderr = '';

		proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
		proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

		proc.on('close', () => {
			const jsonLine = stdout.trim().split('\n').reverse().find(l => l.startsWith('{'));
			if (jsonLine) {
				resolve(JSON.parse(jsonLine) as ValidationResult);
			} else {
				reject(new Error(stderr || 'Failed to parse validation output'));
			}
		});

		proc.on('error', reject);
	});
}

function resolvePathToRange(path: string, doc: vscode.TextDocument): vscode.Range {
	// tasks[N] — point to the Nth task list item so each warning has a unique range.
	const taskMatch = path.match(/^tasks\[(\d+)\]$/);
	if (taskMatch) {
		return resolveTaskItemRange(Number(taskMatch[1]), doc);
	}

	const segments = path.split(/[.[\]]+/).filter(Boolean);

	// Walk segments from deepest to shallowest, skipping numeric array indices.
	for (let i = segments.length - 1; i >= 0; i--) {
		const seg = segments[i];
		if (seg === undefined || /^\d+$/.test(seg)) continue;

		const lines = doc.getText().split('\n');
		for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
			const line = lines[lineIdx];
			if (line === undefined) continue;
			if (new RegExp(`\\b${escapeRegex(seg)}\\s*:`).test(line)) {
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
