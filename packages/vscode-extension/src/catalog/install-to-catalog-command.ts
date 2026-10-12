import { readFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import type { TemplateCatalogKind } from '@sppg2001/atomize-core/services/template/template-catalog';
import type { TemplateInstallScope } from '@sppg2001/atomize-core/services/template/template-install-source';
import { defaultCatalogScope, discoverWorkspaceRoot } from '@sppg2001/atomize-core/services/template/workspace-root';
import * as vscode from 'vscode';
import { parse } from 'yaml';
import { isAtomizeToolingDocument, isMixinDocument } from '../authoring/language-detection.js';
import { createTemplateLibrary } from '../core-library.js';
import { catalogInstallName } from './install-name.js';

const TITLE = 'Atomize: Install to Catalog';

export interface InstallToCatalogDeps {
	/** Prompts to save a dirty file; false when the user cancels. */
	checkDirtyDocument: (doc: vscode.TextDocument, verb: string) => Promise<boolean>;
}

type ScopeItem = vscode.QuickPickItem & { scope: TemplateInstallScope };

export function registerInstallToCatalogCommand(deps: InstallToCatalogDeps): vscode.Disposable {
	return vscode.commands.registerCommand('atomize.installToCatalog', (uri?: vscode.Uri) => installToCatalog(deps, uri));
}

/**
 * Installs the open Template or Mixin into the personal or project Catalog, so it can be run and
 * composed by name (`template:<name>`). Only ever on request: saving a file never installs it. An
 * unsaved AI draft installs straight from the editor.
 */
async function installToCatalog(deps: InstallToCatalogDeps, uri?: vscode.Uri): Promise<void> {
	const doc = uri
		? vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString()) ?? await vscode.workspace.openTextDocument(uri)
		: vscode.window.activeTextEditor?.document;
	if (!doc || !isAtomizeToolingDocument(doc)) {
		void vscode.window.showWarningMessage('Open an Atomize Template or Mixin to install it to the Catalog.');
		return;
	}
	if (!doc.isUntitled && !await deps.checkDirtyDocument(doc, 'install')) return;
	// "Install Saved Version" leaves the editor dirty, so the Catalog gets what's on disk.
	const content = !doc.isUntitled && doc.isDirty ? await readFile(doc.fileName, 'utf8') : doc.getText();

	const kind: TemplateCatalogKind = isMixinDocument(doc) ? 'mixin' : 'template';
	const name = catalogInstallName(doc.isUntitled ? undefined : doc.fileName, templateName(content));
	const { folder, library } = projectFor(doc);

	const scope = await chooseScope(library, kind, name, folder);
	if (!scope) return;

	try {
		const preview = await library.previewInstall({ source: { content, name }, kind, scope });
		let overwrite = false;
		if (preview.exists) {
			const choice = await vscode.window.showWarningMessage(
				`A ${kind} named "${name}" is already in your ${scopeLabel(scope)} Catalog.`,
				{ modal: true, detail: `Overwrite ${preview.targetPath}?` },
				'Overwrite',
			);
			if (choice !== 'Overwrite') return;
			overwrite = true;
		}
		const item = await preview.source.install({ overwrite });
		const open = await vscode.window.showInformationMessage(
			`Installed ${kind} "${item.name}" to your ${scopeLabel(scope)} Catalog. Use it as ${item.ref}.`,
			'Open',
		);
		if (open) await vscode.window.showTextDocument(vscode.Uri.file(item.path));
	} catch (error) {
		void vscode.window.showErrorMessage(`Atomize could not install this ${kind}: ${error instanceof Error ? error.message : String(error)}`);
	}
}

/**
 * The folder whose project the install offers, with its Template Library. A saved file uses its own
 * folder's project. An unsaved draft, or a file in no project (say one in the personal Catalog, or
 * loose in the home folder), uses the open workspace folder's project instead.
 */
function projectFor(doc: vscode.TextDocument): { folder: string | undefined; library: ReturnType<typeof createTemplateLibrary> } {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (!doc.isUntitled) {
		const fileFolder = dirname(doc.fileName);
		const library = createTemplateLibrary(fileFolder);
		if (library.hasProjectCatalog || !workspaceFolder) return { folder: fileFolder, library };
	}
	return { folder: workspaceFolder, library: createTemplateLibrary(workspaceFolder) };
}

function outsideProjectHint(folder: string | undefined): string {
	return folder
		? "This isn't in a project, so only the personal Catalog is available. Open a project folder to install to its Catalog."
		: 'No folder is open, so only the personal Catalog is available. Open a project folder to install to its Catalog.';
}

function templateName(content: string): unknown {
	try {
		return (parse(content) as { name?: unknown } | null)?.name;
	} catch {
		return undefined;
	}
}

const scopeLabel = (scope: TemplateInstallScope) => (scope === 'project' ? 'project' : 'personal');

/**
 * Personal or project, each with the file it would write, and the project named so it's clear which
 * one an unsaved draft would go to. A project that has opted in with its own `.atomize/` folder is
 * offered first. Outside any project, including the home folder, only Personal is offered.
 */
async function chooseScope(
	library: ReturnType<typeof createTemplateLibrary>,
	kind: TemplateCatalogKind,
	name: string,
	folder: string | undefined,
): Promise<TemplateInstallScope | undefined> {
	const personal: ScopeItem = {
		label: 'Personal Catalog',
		description: 'available in every folder on this computer',
		detail: library.getUserTemplatePath(kind, name),
		scope: 'user',
	};
	if (!folder || !library.hasProjectCatalog) {
		const picked = await vscode.window.showQuickPick([personal], {
			title: `${TITLE} — ${name}`,
			placeHolder: outsideProjectHint(folder),
		});
		return picked?.scope;
	}
	const project: ScopeItem = {
		label: 'Project Catalog',
		description: `shared with ${basename(discoverWorkspaceRoot(folder))}, to commit with it`,
		detail: library.getProjectTemplatePath(kind, name),
		scope: 'project',
	};
	const items = defaultCatalogScope(folder) === 'project' ? [project, personal] : [personal, project];
	const picked = await vscode.window.showQuickPick(items, { title: `${TITLE} — ${name}`, placeHolder: `Where should this ${kind} be installed?` });
	return picked?.scope;
}
