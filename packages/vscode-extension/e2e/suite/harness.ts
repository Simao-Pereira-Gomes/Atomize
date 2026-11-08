import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import * as vscode from 'vscode';

/** A minimal runner for the extension host: no mocha, just named async tests run in order. */
type Test = { name: string; run: () => Promise<void> };

/** A test still running after this long has hung (e.g. on a dialog nobody answers) and fails. */
const TEST_TIMEOUT_MS = 60_000;

function withinTimeout(run: () => Promise<void>): Promise<void> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error(`Test did not finish within ${TEST_TIMEOUT_MS} ms`)), TEST_TIMEOUT_MS);
	});
	return Promise.race([run(), timeout]).finally(() => clearTimeout(timer));
}
const tests: Test[] = [];

export function test(name: string, run: () => Promise<void>): void {
	tests.push({ name, run });
}

export async function runAll(): Promise<void> {
	const failures: string[] = [];
	for (const { name, run } of tests) {
		const started = Date.now();
		try {
			await withinTimeout(run);
			console.log(`  ✓ ${name} (${Date.now() - started} ms)`);
		} catch (error) {
			const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
			console.error(`  ✗ ${name}\n${detail}`);
			failures.push(name);
		} finally {
			await vscode.commands.executeCommand('notifications.clearAll');
			await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		}
	}
	console.log(`\n${tests.length - failures.length} passed, ${failures.length} failed`);
	if (failures.length > 0) throw new Error(`${failures.length} e2e test(s) failed: ${failures.join('; ')}`);
}

/** The fixture workspace the run opened. */
export function workspaceFile(...segments: string[]): vscode.Uri {
	const folder = vscode.workspace.workspaceFolders?.[0];
	assert.ok(folder, 'the e2e run must open the fixture workspace');
	return vscode.Uri.file(path.join(folder.uri.fsPath, ...segments));
}

export async function open(uri: vscode.Uri): Promise<vscode.TextDocument> {
	const doc = await vscode.workspace.openTextDocument(uri);
	await vscode.window.showTextDocument(doc);
	return doc;
}

/** Polls until `check` returns a value, failing with `what` after `timeoutMs`. */
export async function waitFor<T>(what: string, check: () => T | undefined | false, timeoutMs = 20_000): Promise<T> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const value = check();
		if (value) return value;
		await new Promise(resolve => setTimeout(resolve, 100));
	}
	throw new Error(`Timed out after ${timeoutMs} ms waiting for ${what}`);
}

/** Diagnostics the extension published for a document, once validation has settled on them. */
export async function diagnosticsFor(uri: vscode.Uri, expectAny: boolean): Promise<readonly vscode.Diagnostic[]> {
	if (expectAny) {
		return await waitFor(`diagnostics for ${path.basename(uri.fsPath)}`, () => {
			const found = vscode.languages.getDiagnostics(uri);
			return found.length > 0 ? found : undefined;
		});
	}
	// No diagnostics is also what's there before validation runs, so give it time to publish any.
	await new Promise(resolve => setTimeout(resolve, 3_000));
	return vscode.languages.getDiagnostics(uri);
}

/**
 * Runs a command without awaiting it: commands that report through a notification don't finish
 * until it's dismissed, which nobody does here. Wait for the command's effect instead.
 */
export function fire(command: string, ...args: unknown[]): void {
	void vscode.commands.executeCommand(command, ...args);
}

export const codeOf = (diagnostic: vscode.Diagnostic): string | undefined =>
	typeof diagnostic.code === 'object' ? String(diagnostic.code.value) : diagnostic.code === undefined ? undefined : String(diagnostic.code);

export { assert };
