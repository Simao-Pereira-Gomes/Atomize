import { spawn } from 'node:child_process';
import * as vscode from 'vscode';

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

interface ValidationRequest {
	doc: vscode.TextDocument;
	diagnostics: vscode.DiagnosticCollection;
	cliAvailable: boolean;
	onResult?: (result: ValidationResult) => void;
	onError?: (error: Error) => void;
}

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

export function runValidation(
	doc: vscode.TextDocument,
	diagnostics: vscode.DiagnosticCollection,
	cliAvailable: boolean,
	onResult?: (result: ValidationResult) => void,
	onError?: (error: Error) => void,
): void {
	if (!cliAvailable) return;

	const key = doc.uri.toString();
	const state = getRunState(key);

	if (state.running) {
		state.pending = { doc, diagnostics, cliAvailable, onResult, onError };
		return;
	}

	state.running = true;
	state.pending = undefined;

	spawnValidation(doc.uri.fsPath).then(result => {
		state.running = false;

		const items = [
			...result.errors.map(e =>
				makeDiagnostic(e.path, e.message, vscode.DiagnosticSeverity.Error, doc),
			),
			...result.warnings.map(w =>
				makeDiagnostic(w.path, w.message, vscode.DiagnosticSeverity.Warning, doc),
			),
		];
		diagnostics.set(doc.uri, items);

		onResult?.(result);

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
	runValidation(
		pending.doc,
		pending.diagnostics,
		pending.cliAvailable,
		pending.onResult,
		pending.onError,
	);
}

function extendedEnv(): NodeJS.ProcessEnv {
	const home = process.env.HOME ?? '';
	const extra = [
		`${home}/.bun/bin`,
		`${home}/.npm-global/bin`,
		'/usr/local/bin',
		'/opt/homebrew/bin',
	].join(':');
	return { ...process.env, PATH: `${extra}:${process.env.PATH ?? ''}` };
}

function spawnValidation(filePath: string): Promise<ValidationResult> {
	return new Promise((resolve, reject) => {
		const proc = spawn('atomize', ['validate', '--output', 'json', filePath], { shell: true, env: extendedEnv() });
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

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makeDiagnostic(
	path: string,
	message: string,
	severity: vscode.DiagnosticSeverity,
	doc: vscode.TextDocument,
): vscode.Diagnostic {
	const range = resolvePathToRange(path, doc);
	const d = new vscode.Diagnostic(range, message, severity);
	d.source = 'atomize';
	return d;
}
