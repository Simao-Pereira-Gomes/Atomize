import { dirname } from 'node:path';
import type { IPlatformAdapter } from '@sppg2001/atomize-core/platforms/interfaces/platform.interface';
import {
	type DocumentGrounding,
	fitDocumentsToLimit,
	listProjectWikis,
	listWikiPagePaths,
	loadLocalReference,
	loadWikiReference,
	parseReferenceRef,
	type ReferenceDocument,
	ReferenceDocumentError,
	readProjectReferences,
	saveProjectReference,
	truncationNotices,
} from '@sppg2001/atomize-core/services/template/reference-documents';
import { discoverWorkspaceRoot } from '@sppg2001/atomize-core/services/template/workspace-root';
import * as vscode from 'vscode';

export interface ReferenceStepOptions {
	title: string;
	/** The document the AI request is about; locates the Workspace Root. */
	resource: vscode.Uri | undefined;
	/** The grounding profile's connection, for wiki pages; without one, wiki pages are unavailable. */
	adapter: IPlatformAdapter | undefined;
}

type EntryItem = vscode.QuickPickItem & { entry: string };
type AddAction = 'file' | 'wiki';
type AddButton = vscode.QuickInputButton & { action: AddAction };

/**
 * Chooses the Reference Documents for an AI draft or improvement (ADR-0069, ADR-0070): the Project
 * Reference Documents in `.atomize/ai.yaml` ticked, plus local files or wiki pages added for this
 * run and optionally saved for the project. Documents are fitted to the shared limit, and any
 * shortening is shown before anything is sent. Resolves undefined when the user cancels.
 */
export async function chooseReferenceDocuments(options: ReferenceStepOptions): Promise<DocumentGrounding | null | undefined> {
	const root = workspaceRootFor(options.resource);
	const saved = root ? await readProjectReferences(root) : { entries: [], problems: [] };
	for (const problem of saved.problems) void vscode.window.showWarningMessage(problem);

	const added: ReferenceDocument[] = [];
	let ticked = new Set(saved.entries);
	while (true) {
		const outcome = await showStep(options, saved.entries, added, ticked);
		if (outcome === undefined) return undefined;
		if (outcome.kind === 'continue') {
			ticked = outcome.ticked;
			break;
		}
		ticked = outcome.ticked;
		const documents = outcome.action === 'file' ? await addLocalFiles(root) : await addWikiPages(options.adapter);
		for (const document of documents) {
			if (added.some(existing => existing.ref === document.ref) || saved.entries.includes(document.ref)) continue;
			added.push(document);
			ticked.add(document.ref);
		}
		if (documents.length > 0 && root) await offerToSave(root, documents, options.title);
	}

	const documents = [...added.filter(document => ticked.has(document.ref))];
	for (const entry of saved.entries.filter(entry => ticked.has(entry) && !added.some(document => document.ref === entry))) {
		const document = await loadSaved(root, entry, options.adapter);
		if (document) documents.push(document);
	}
	if (documents.length === 0) return null;
	return confirmFit(documents, options.title);
}

function workspaceRootFor(resource: vscode.Uri | undefined): string | undefined {
	const folder = (resource && vscode.workspace.getWorkspaceFolder(resource)) ?? vscode.workspace.workspaceFolders?.[0];
	if (resource?.scheme === 'file') return discoverWorkspaceRoot(dirname(resource.fsPath));
	return folder ? discoverWorkspaceRoot(folder.uri.fsPath) : undefined;
}

function showStep(
	options: ReferenceStepOptions,
	saved: string[],
	added: ReferenceDocument[],
	ticked: Set<string>,
): Promise<{ kind: 'continue'; ticked: Set<string> } | { kind: 'add'; action: AddAction; ticked: Set<string> } | undefined> {
	return new Promise(resolve => {
		const picker = vscode.window.createQuickPick<EntryItem>();
		let settled = false;
		const finish = (value: Parameters<typeof resolve>[0]) => {
			if (settled) return;
			settled = true;
			resolve(value);
			picker.hide();
		};
		const items: EntryItem[] = [
			...saved.map(entry => ({ label: entry, description: 'saved for this project', entry })),
			...added.map(document => ({ label: document.ref, description: 'added for this run', entry: document.ref })),
		];
		picker.title = `${options.title} — Reference Documents`;
		picker.placeholder = items.length > 0
			? 'Untick any to leave out of this run, add more with the buttons above, then press Enter'
			: 'No Reference Documents yet — add a local file or wiki page with the buttons above, or press Enter to continue';
		picker.canSelectMany = true;
		picker.items = items;
		picker.selectedItems = items.filter(item => ticked.has(item.entry));
		const buttons: AddButton[] = [{ action: 'file', iconPath: new vscode.ThemeIcon('new-file'), tooltip: 'Add a local Markdown or text file' }];
		if (options.adapter) buttons.push({ action: 'wiki', iconPath: new vscode.ThemeIcon('book'), tooltip: 'Add an Azure DevOps wiki page' });
		picker.buttons = buttons;
		const current = () => new Set(picker.selectedItems.map(item => item.entry));
		picker.onDidAccept(() => finish({ kind: 'continue', ticked: current() }));
		picker.onDidTriggerButton(button => finish({ kind: 'add', action: (button as AddButton).action, ticked: current() }));
		picker.onDidHide(() => {
			finish(undefined);
			picker.dispose();
		});
		picker.show();
	});
}

async function addLocalFiles(root: string | undefined): Promise<ReferenceDocument[]> {
	if (!root) {
		void vscode.window.showWarningMessage('Open a folder to add local Reference Documents; they must be files inside the workspace.');
		return [];
	}
	const picked = await vscode.window.showOpenDialog({
		defaultUri: vscode.Uri.file(root),
		canSelectMany: true,
		filters: { 'Markdown or text': ['md', 'txt'] },
		openLabel: 'Add Reference Document',
	});
	const documents: ReferenceDocument[] = [];
	for (const uri of picked ?? []) {
		try {
			documents.push(await loadLocalReference(root, uri.fsPath));
		} catch (error) {
			void vscode.window.showWarningMessage(error instanceof Error ? error.message : String(error));
		}
	}
	return documents;
}

async function addWikiPages(adapter: IPlatformAdapter | undefined): Promise<ReferenceDocument[]> {
	if (!adapter) return [];
	try {
		const wikis = await inProgress("Loading this project's wikis…", () => listProjectWikis(adapter));
		if (wikis.length === 0) {
			void vscode.window.showInformationMessage('This project has no wikis.');
			return [];
		}
		const wiki = wikis.length === 1
			? wikis[0]
			: (await vscode.window.showQuickPick(wikis.map(item => ({ label: item.name, wiki: item })), { placeHolder: 'Which wiki?' }))?.wiki;
		if (!wiki) return [];
		const paths = await inProgress(`Loading the pages of ${wiki.name}…`, () => listWikiPagePaths(adapter, wiki.id));
		const pages = await vscode.window.showQuickPick(paths.map(path => ({ label: path })), {
			canPickMany: true,
			matchOnDescription: true,
			placeHolder: `Pages from ${wiki.name} — only each page itself is read, not its sub-pages`,
		});
		if (!pages?.length) return [];
		return await inProgress(`Reading ${pages.length} wiki ${pages.length === 1 ? 'page' : 'pages'}…`, async () => {
			const documents: ReferenceDocument[] = [];
			for (const page of pages) documents.push(await loadWikiReference(adapter, { kind: 'wiki', wiki: wiki.name, pagePath: page.label }));
			return documents;
		});
	} catch (error) {
		await reportWikiProblem(error);
		return [];
	}
}

async function offerToSave(root: string, documents: ReferenceDocument[], title: string): Promise<void> {
	const choice = await vscode.window.showQuickPick(
		[
			{ label: 'Use for this run only', save: false },
			{ label: 'Also save for this project', description: 'Adds them to .atomize/ai.yaml, offered on every AI run', save: true },
		],
		{ title: `${title} — ${documents.map(document => document.ref).join(', ')}` },
	);
	if (!choice?.save) return;
	for (const document of documents) await saveProjectReference(root, document.ref);
	void vscode.window.showInformationMessage(`Saved to .atomize/ai.yaml: ${documents.map(document => document.ref).join(', ')}`);
}

/** A saved default that can't be loaded is reported and left out; one this profile can't reach is "unavailable". */
async function loadSaved(root: string | undefined, entry: string, adapter: IPlatformAdapter | undefined): Promise<ReferenceDocument | undefined> {
	try {
		const ref = parseReferenceRef(entry);
		if (ref.kind === 'wiki') {
			if (!adapter) {
				void vscode.window.showWarningMessage(`Left out ${entry}: wiki pages need a Connection Profile, and this run has no grounding.`);
				return undefined;
			}
			return await inProgress(`Reading ${entry}…`, () => loadWikiReference(adapter, ref));
		}
		if (!root) return undefined;
		return await loadLocalReference(root, ref.path);
	} catch (error) {
		if (error instanceof ReferenceDocumentError && error.code === 'REFERENCE_UNAVAILABLE') {
			void vscode.window.showWarningMessage(`Unavailable for this profile, so left out: ${error.message}`);
		} else if (error instanceof ReferenceDocumentError && error.code === 'REFERENCE_WIKI_ACCESS') {
			await reportWikiProblem(error);
		} else {
			void vscode.window.showWarningMessage(`Left out a Project Reference Document: ${error instanceof Error ? error.message : String(error)}`);
		}
		return undefined;
	}
}

/** Shows a progress notification while a wiki call runs, so a slow wiki doesn't look like a freeze. */
function inProgress<T>(title: string, task: () => Promise<T>): Thenable<T> {
	return vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title }, task);
}

async function reportWikiProblem(error: unknown): Promise<void> {
	const message = error instanceof Error ? error.message : String(error);
	if (error instanceof ReferenceDocumentError && error.code === 'REFERENCE_WIKI_ACCESS') {
		const choice = await vscode.window.showWarningMessage(message, 'Manage Profiles');
		if (choice) await vscode.commands.executeCommand('atomize.manageProfiles');
		return;
	}
	void vscode.window.showWarningMessage(message);
}

/** Shows any shortening before sending: continue, leave some documents out, or cancel. */
async function confirmFit(documents: ReferenceDocument[], title: string): Promise<DocumentGrounding | null | undefined> {
	let kept = documents;
	while (true) {
		const grounding = fitDocumentsToLimit(kept);
		const notices = truncationNotices(grounding);
		if (notices.length === 0) return grounding;
		const choice = await vscode.window.showWarningMessage(
			'Some Reference Documents are too long for the AI request.',
			{ modal: true, detail: `${notices.join('.\n')}.` },
			'Continue',
			'Leave Some Out',
		);
		if (choice === 'Continue') return grounding;
		if (choice !== 'Leave Some Out') return undefined;
		const keep = await vscode.window.showQuickPick(
			kept.map(document => ({ label: document.title, description: `${document.text.length.toLocaleString('en-US')} characters`, picked: true, document })),
			{ title: `${title} — Reference Documents to keep`, canPickMany: true },
		);
		if (!keep) return undefined;
		kept = keep.map(item => item.document);
		if (kept.length === 0) return null;
	}
}
