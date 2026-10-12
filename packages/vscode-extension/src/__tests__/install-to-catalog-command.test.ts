import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { baseVscodeMock } from './vscode-test-helpers.js';

const TEMPLATE = 'version: "1.0"\nname: Backend API\nfilter: {}\ntasks:\n  - title: Build\n    estimationPercent: 100\n';

type Picked = { label: string; detail?: string; scope: string };
let offered: Picked[][] = [];
let workspaceFolders: { uri: { fsPath: string } }[] | undefined;
let handler: ((uri?: unknown) => Promise<void>) | undefined;
let activeDocument: unknown;

mock.module('vscode', () => ({
	...baseVscodeMock(),
	commands: { registerCommand: (_id: string, run: (uri?: unknown) => Promise<void>) => { handler = run; return { dispose() {} }; } },
	workspace: {
		get textDocuments() { return activeDocument ? [activeDocument] : []; },
		get workspaceFolders() { return workspaceFolders; },
	},
	window: {
		get activeTextEditor() { return activeDocument ? { document: activeDocument } : undefined; },
		// Records what's offered, then cancels, so nothing is installed.
		showQuickPick: async (items: Picked[]) => { offered.push(items); return undefined; },
		showWarningMessage: async () => undefined,
		showErrorMessage: async () => undefined,
		showInformationMessage: async () => undefined,
	},
}));

const { registerInstallToCatalogCommand } = await import('../catalog/install-to-catalog-command.js');

const document = (fileName: string, untitled: boolean) => ({
	languageId: 'atomize-yaml',
	fileName,
	isUntitled: untitled,
	isDirty: false,
	uri: { toString: () => fileName },
	getText: () => TEMPLATE,
});

let project: string;

beforeEach(async () => {
	offered = [];
	workspaceFolders = undefined;
	project = await mkdtemp(join(tmpdir(), 'atomize-install-cmd-'));
	await mkdir(join(project, '.atomize'));
	await writeFile(join(project, 'backend-api.atomize.yaml'), TEMPLATE);
	registerInstallToCatalogCommand({ checkDirtyDocument: async () => true });
});

afterEach(async () => {
	await rm(project, { recursive: true, force: true });
});

describe('Atomize: Install to Catalog', () => {
	test('offers both Catalogs, at different paths, for a file in a project', async () => {
		activeDocument = document(join(project, 'backend-api.atomize.yaml'), false);
		await handler?.();
		const items = offered[0] ?? [];
		expect(items.map(item => item.scope)).toEqual(['project', 'user']);
		expect(items[0]?.detail).toBe(join(project, '.atomize', 'catalog', 'templates', 'backend-api.atomize.yaml'));
		expect(items[1]?.detail).toBe(join(homedir(), '.atomize', 'catalog', 'templates', 'backend-api.atomize.yaml'));
	});

	test('offers only the personal Catalog for an unsaved draft when the open folder is the home folder', async () => {
		workspaceFolders = [{ uri: { fsPath: homedir() } }];
		activeDocument = document('Untitled-1', true);
		await handler?.();
		expect((offered[0] ?? []).map(item => item.scope)).toEqual(['user']);
	});

	test("offers the open folder's project Catalog for a file in the personal Catalog", async () => {
		workspaceFolders = [{ uri: { fsPath: project } }];
		activeDocument = document(join(homedir(), '.atomize', 'catalog', 'templates', 'backend-api.atomize.yaml'), false);
		await handler?.();
		const items = offered[0] ?? [];
		expect(items.map(item => item.scope)).toEqual(['project', 'user']);
		expect(items[0]?.detail).toBe(join(project, '.atomize', 'catalog', 'templates', 'backend-api.atomize.yaml'));
	});

	test("offers the open folder's project Catalog for an unsaved draft", async () => {
		workspaceFolders = [{ uri: { fsPath: project } }];
		activeDocument = document('Untitled-1', true);
		await handler?.();
		const items = offered[0] ?? [];
		expect(items.map(item => item.scope)).toEqual(['project', 'user']);
		expect(new Set(items.map(item => item.detail)).size).toBe(2);
	});
});
