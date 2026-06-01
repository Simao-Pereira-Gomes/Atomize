import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as vscode from 'vscode';
import { isAtomizeDocument } from '../authoring/language-detection.js';
import { buildTemplateCatalogListArgs, probeCli } from '../cli/cli-provider.js';
import { extendedEnv } from '../cli/env-utils.js';
import { getConfiguredCliPath } from '../config/atomize-configuration.js';

export const CATALOG_ITEM_SCHEME = 'atomize-catalog';

export class CatalogItemProvider implements vscode.TextDocumentContentProvider, vscode.Disposable {
	private readonly _content = new Map<string, string>();
	private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
	readonly onDidChange = this._onDidChange.event;

	set(uri: vscode.Uri, content: string): void {
		this._content.set(uri.toString(), content);
		this._onDidChange.fire(uri);
	}

	delete(uri: vscode.Uri): void {
		this._content.delete(uri.toString());
	}

	provideTextDocumentContent(uri: vscode.Uri): string {
		return this._content.get(uri.toString()) ?? '';
	}

	dispose(): void {
		this._onDidChange.dispose();
	}
}

interface CatalogJsonItem {
	name: string;
	displayName: string;
	description: string;
	ref: string;
	scope: 'builtin' | 'user' | 'project';
	kind: 'template' | 'mixin';
	path: string;
	overrides?: { name: string; ref: string; scope: string; path: string };
	origin?: { ref: string; scope: string };
}

type CatalogPickItem = vscode.QuickPickItem & { catalogItem: CatalogJsonItem };

type PickAction =
	| { type: 'select'; ref: string }
	| { type: 'open'; item: CatalogJsonItem };

const OPEN_FILE_BUTTON: vscode.QuickInputButton = {
	iconPath: new vscode.ThemeIcon('go-to-file'),
	tooltip: 'Open backing file',
};

function fetchCatalog(cliPath: string): Promise<CatalogJsonItem[] | null> {
	return new Promise(resolve => {
		const proc = spawn(cliPath, buildTemplateCatalogListArgs(), { shell: false, env: extendedEnv() });
		let stdout = '';
		proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
		proc.on('close', () => {
			try {
				const parsed = JSON.parse(stdout);
				resolve(Array.isArray(parsed) ? parsed : null);
			} catch {
				resolve(null);
			}
		});
		proc.on('error', () => resolve(null));
	});
}

function toCatalogPickItem(item: CatalogJsonItem): CatalogPickItem {
	const detailParts = [item.ref];
	if (item.description) detailParts.push(item.description);
	if (item.overrides) detailParts.push(`⚠ overrides ${item.overrides.scope} at ${item.overrides.path}`);
	if (item.origin) detailParts.push(`↖ based on ${item.origin.scope} ${item.origin.ref}`);

	return {
		label: item.displayName,
		description: `${item.scope}  ·  ${item.kind}`,
		detail: detailParts.join('  ·  '),
		buttons: [OPEN_FILE_BUTTON],
		catalogItem: item,
	};
}

function buildQuickPickItems(items: CatalogJsonItem[]): (CatalogPickItem | vscode.QuickPickItem)[] {
	const result: (CatalogPickItem | vscode.QuickPickItem)[] = [];
	const templates = items.filter(i => i.kind === 'template');
	const mixins = items.filter(i => i.kind === 'mixin');

	if (templates.length > 0) {
		result.push({ label: 'Templates', kind: vscode.QuickPickItemKind.Separator });
		for (const item of templates) result.push(toCatalogPickItem(item));
	}
	if (mixins.length > 0) {
		result.push({ label: 'Mixins', kind: vscode.QuickPickItemKind.Separator });
		for (const item of mixins) result.push(toCatalogPickItem(item));
	}
	return result;
}

async function openCatalogItemFile(item: CatalogJsonItem, provider: CatalogItemProvider): Promise<void> {
	if (item.scope === 'builtin') {
		let content: string;
		try {
			content = await fs.readFile(item.path, 'utf8');
		} catch {
			void vscode.window.showErrorMessage(`Atomize: Could not read file: ${item.path}`);
			return;
		}
		const uri = vscode.Uri.from({
			scheme: CATALOG_ITEM_SCHEME,
			authority: 'catalog',
			path: `/${item.kind}/${item.name}.yaml`,
		});
		provider.set(uri, content);
		const doc = await vscode.workspace.openTextDocument(uri);
		await vscode.languages.setTextDocumentLanguage(doc, 'yaml');
		await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: false });
	} else {
		const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(item.path));
		await vscode.window.showTextDocument(doc);
	}
}

export interface BrowseCatalogCommandDeps {
	provider: CatalogItemProvider;
	showCliUnavailable: (cliPath: string, message: string) => Promise<void>;
}

export function registerBrowseCatalogCommand(deps: BrowseCatalogCommandDeps): vscode.Disposable {
	return vscode.commands.registerCommand('atomize.browseCatalog', async () => {
		const activeDoc = vscode.window.activeTextEditor?.document;
		const targetDoc = activeDoc && isAtomizeDocument(activeDoc) ? activeDoc : undefined;

		const cliPath = getConfiguredCliPath();
		const probe = await probeCli(cliPath);
		if (!probe.available) {
			await deps.showCliUnavailable(cliPath, 'Atomize CLI not found. Install it to browse the catalog.');
			return;
		}

		const items = await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: 'Loading catalog…', cancellable: false },
			() => fetchCatalog(cliPath),
		);

		if (items === null) {
			void vscode.window.showErrorMessage('Atomize: Could not load the catalog. Check that the Atomize CLI is working.');
			return;
		}

		if (items.length === 0) {
			void vscode.window.showInformationMessage('Atomize: No templates or mixins are available in the catalog.');
			return;
		}

		const quickPick = vscode.window.createQuickPick<CatalogPickItem | vscode.QuickPickItem>();
		quickPick.title = 'Atomize: Browse Catalog';
		quickPick.matchOnDescription = true;
		quickPick.matchOnDetail = true;
		quickPick.placeholder = targetDoc
			? 'Select a template or mixin to insert its ref'
			: 'Select a template or mixin to copy its ref to clipboard';
		quickPick.items = buildQuickPickItems(items);

		const action = await new Promise<PickAction | null>(resolve => {
			let settled = false;
			function settle(value: PickAction | null): void {
				if (settled) return;
				settled = true;
				quickPick.hide();
				resolve(value);
			}
			quickPick.onDidAccept(() => {
				const selected = quickPick.activeItems[0];
				settle(selected && 'catalogItem' in selected
					? { type: 'select', ref: selected.catalogItem.ref }
					: null);
			});
			quickPick.onDidTriggerItemButton(e => {
				settle('catalogItem' in e.item
					? { type: 'open', item: e.item.catalogItem }
					: null);
			});
			quickPick.onDidHide(() => settle(null));
			quickPick.show();
		});

		quickPick.dispose();

		if (!action) return;

		if (action.type === 'open') {
			await openCatalogItemFile(action.item, deps.provider);
			return;
		}

		const { ref } = action;
		const editor = vscode.window.visibleTextEditors.find(
			e => e.document.uri.toString() === targetDoc?.uri.toString(),
		);
		if (editor) {
			await editor.edit(b => b.insert(editor.selection.active, ref));
			return;
		}

		await vscode.env.clipboard.writeText(ref);
		void vscode.window.showInformationMessage(`Atomize: Copied "${ref}" to clipboard.`);
	});
}
