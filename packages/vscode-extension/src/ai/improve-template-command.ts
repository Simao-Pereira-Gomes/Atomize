import { readFile } from 'node:fs/promises';
import { type ImproveResult, improveTemplate } from '@sppg2001/atomize-core/services/template/ai-template-loop';
import { MAX_ATTEMPTS } from '@sppg2001/atomize-core/services/template/llm-template-generator';
import type { DocumentGrounding } from '@sppg2001/atomize-core/services/template/reference-documents';
import { applyProposalToYaml } from '@sppg2001/atomize-core/services/template/template-writeback';
import type { TaskTemplate } from '@sppg2001/atomize-core/templates/schema';
import { CancellationError } from '@sppg2001/atomize-core/utils/errors';
import * as vscode from 'vscode';
import { parse } from 'yaml';
import { resolveDocumentPath } from '../catalog/catalog-document-path.js';
import { getAIModel } from '../config/atomize-configuration.js';
import { createTemplateLibrary } from '../core-library.js';
import { type AIGrounding, type AIGroundingDeps, chooseAIGrounding } from './ai-grounding.js';
import { AIUnavailableError, type CopilotLmSession, openCopilotSession } from './copilot-session.js';
import { languageModels, offerFix } from './copilot-support.js';
import { catalogRefFor, improvedCopyContent, reviewMessage } from './improvement-proposal.js';
import { chooseReferenceDocuments } from './reference-documents-step.js';

const TITLE = 'Atomize: Improve Template with AI';
/** Context key listing open proposal documents, so the diff's title-bar actions appear only on them. */
const PROPOSALS_CONTEXT = 'atomize.improvementProposals';

export interface ImproveCommandDeps extends AIGroundingDeps {
	/** Prompts to save a dirty document; false when the user cancels. */
	checkDirtyDocument: (doc: vscode.TextDocument, verb: string) => Promise<boolean>;
	isRunnableTemplate: (doc: vscode.TextDocument) => boolean;
}

interface Proposal {
	source: vscode.Uri;
	catalogRef: string | undefined;
}

/** Open proposals, keyed by their untitled document's URI. */
const proposals = new Map<string, Proposal>();

export function registerImproveTemplateCommand(deps: ImproveCommandDeps): vscode.Disposable {
	return vscode.Disposable.from(
		vscode.commands.registerCommand('atomize.improveTemplateWithAI', (uri?: vscode.Uri) => improveTemplateWithAI(deps, uri)),
		vscode.commands.registerCommand('atomize.acceptImprovement', (uri?: vscode.Uri) => acceptImprovement(uri)),
		vscode.commands.registerCommand('atomize.saveImprovementAsNew', (uri?: vscode.Uri) => saveImprovementAsNew(uri)),
		vscode.commands.registerCommand('atomize.rejectImprovement', (uri?: vscode.Uri) => rejectImprovement(uri)),
		vscode.workspace.onDidCloseTextDocument(doc => {
			if (proposals.delete(doc.uri.toString())) void publishProposals();
		}),
	);
}

async function improveTemplateWithAI(deps: ImproveCommandDeps, uri?: vscode.Uri): Promise<void> {
	const doc = uri
		? vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString()) ?? await vscode.workspace.openTextDocument(uri)
		: vscode.window.activeTextEditor?.document;
	if (!doc || !deps.isRunnableTemplate(doc)) return;
	if (!await deps.checkDirtyDocument(doc, 'improve')) return;

	const guidance = await vscode.window.showInputBox({
		title: TITLE,
		prompt: 'What should the improvement focus on? Leave blank for a general review.',
		placeHolder: 'e.g. tighten the estimates, add security reviews',
		ignoreFocusOut: true,
	});
	if (guidance === undefined) return;

	const path = resolveDocumentPath(doc.uri);
	const library = createTemplateLibrary();
	let resolvedTemplate: TaskTemplate;
	try {
		({ template: resolvedTemplate } = await library.loadSource(path));
	} catch (error) {
		void vscode.window.showErrorMessage(`Atomize could not load this Template: ${error instanceof Error ? error.message : String(error)}`);
		return;
	}

	const grounding = await chooseAIGrounding(deps, {
		title: TITLE,
		resource: doc.uri,
		noGrounding: { label: 'No grounding', description: 'Review the Template on its own' },
		storyView: { kind: 'applied', templateFilter: resolvedTemplate.filter },
		storyPlaceholder: 'Tick Stories to learn from, or press Enter with none for project metadata only.',
		purpose: 'The improvement',
	});
	if (grounding === 'cancelled') return;
	const documentGrounding = await chooseReferenceDocuments({ title: TITLE, resource: doc.uri, adapter: grounding.adapter });
	if (documentGrounding === undefined) return;

	let prepared: { sourceText: string; result: ImproveResult; catalogRef: string | undefined } | undefined;
	try {
		prepared = await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: TITLE, cancellable: true },
			(progress, token) => runImprovement({ path, guidance, library, resolvedTemplate, grounding, documentGrounding }, progress, token),
		);
	} catch (error) {
		if (error instanceof AIUnavailableError) {
			await offerFix(error, () => improveTemplateWithAI(deps, doc.uri));
			return;
		}
		void vscode.window.showErrorMessage(`Atomize could not improve this Template: ${error instanceof Error ? error.message : String(error)}`);
		return;
	}
	if (!prepared) return;

	const { sourceText, result, catalogRef } = prepared;
	const proposal = result.ok ? result.template : (result.template as TaskTemplate | undefined);
	if (!proposal) {
		void vscode.window.showErrorMessage(`Copilot did not return a usable proposal, so ${vscode.workspace.asRelativePath(doc.uri)} is unchanged.`);
		return;
	}

	const proposalText = applyProposalToYaml(sourceText, proposal);
	if (proposalText === sourceText) {
		void vscode.window.showInformationMessage('Copilot proposed no changes to this Template.');
		return;
	}
	const proposalDoc = await vscode.workspace.openTextDocument({ language: 'yaml', content: proposalText });
	proposals.set(proposalDoc.uri.toString(), { source: doc.uri, catalogRef });
	await publishProposals();
	await vscode.commands.executeCommand(
		'vscode.diff',
		doc.uri,
		proposalDoc.uri,
		`${vscode.workspace.asRelativePath(doc.uri)} ↔ Copilot's proposal`,
	);
	void vscode.window.showInformationMessage(reviewMessage(result.notes, result.ok ? [] : result.errors));
}

/** Runs the improvement, resolving undefined when the user cancelled. */
async function runImprovement(
	request: { path: string; guidance: string; library: ReturnType<typeof createTemplateLibrary>; resolvedTemplate: TaskTemplate; grounding: AIGrounding; documentGrounding: DocumentGrounding | null },
	progress: vscode.Progress<{ message?: string }>,
	token: vscode.CancellationToken,
): Promise<{ sourceText: string; result: ImproveResult; catalogRef: string | undefined } | undefined> {
	const cancellation = new AbortController();
	let session: CopilotLmSession | undefined;
	const onCancel = token.onCancellationRequested(() => {
		cancellation.abort();
		session?.abort();
	});
	const { path, guidance, library, resolvedTemplate, grounding, documentGrounding } = request;
	try {
		progress.report({ message: 'Reading the Template…' });
		const [sourceText, catalog] = await Promise.all([readFile(path, 'utf8'), library.getCatalog('template')]);

		progress.report({ message: 'Connecting to Copilot…' });
		session = await openCopilotSession(languageModels, getAIModel());
		if (token.isCancellationRequested) return undefined;

		let received = 0;
		progress.report({ message: `Reviewing with ${session.modelName}…` });
		const result = await improveTemplate(session, {
			template: parse(sourceText) as TaskTemplate,
			resolvedTemplate,
			guidance: guidance.trim() || null,
			projectGrounding: grounding.projectGrounding,
			storyGrounding: grounding.storyGrounding,
			documentGrounding,
			compose: proposal => library.composeTemplate(proposal, path),
		}, {
			signal: cancellation.signal,
			onChunk: chunk => {
				received += chunk.length;
				progress.report({ message: `Reviewing with ${session?.modelName} (${received} characters)…` });
			},
			onRepairStart: attempt => progress.report({ message: `Fixing validation problems (attempt ${attempt} of ${MAX_ATTEMPTS})…` }),
		});
		return { sourceText, result, catalogRef: catalogRefFor(path, catalog.items) };
	} catch (error) {
		if (error instanceof CancellationError || cancellation.signal.aborted) return undefined;
		throw error;
	} finally {
		onCancel.dispose();
		session?.dispose();
	}
}

/** Replaces the source with the proposal as it now reads, including edits, as one undoable change; the file is left unsaved. */
async function acceptImprovement(uri?: vscode.Uri): Promise<void> {
	const found = findProposal(uri);
	if (!found) return;
	const [proposalDoc, proposal] = found;
	const sourceDoc = await vscode.workspace.openTextDocument(proposal.source);
	const edit = new vscode.WorkspaceEdit();
	edit.replace(sourceDoc.uri, new vscode.Range(sourceDoc.positionAt(0), sourceDoc.positionAt(sourceDoc.getText().length)), proposalDoc.getText());
	if (!await vscode.workspace.applyEdit(edit)) {
		void vscode.window.showErrorMessage('Atomize could not apply the proposal. The file is unchanged.');
		return;
	}
	await closeProposal(proposalDoc);
	await vscode.window.showTextDocument(sourceDoc);
}

/** Opens the proposal, including edits, as a new untitled Template; the source stays as it was. */
async function saveImprovementAsNew(uri?: vscode.Uri): Promise<void> {
	const found = findProposal(uri);
	if (!found) return;
	const [proposalDoc, proposal] = found;
	let content: string;
	try {
		content = improvedCopyContent(proposalDoc.getText(), proposal.catalogRef);
	} catch (error) {
		void vscode.window.showErrorMessage(`The proposal isn't valid YAML, so it can't be saved as a new Template: ${error instanceof Error ? error.message : String(error)}`);
		return;
	}
	await closeProposal(proposalDoc);
	await vscode.window.showTextDocument(await vscode.workspace.openTextDocument({ language: 'yaml', content }));
}

async function rejectImprovement(uri?: vscode.Uri): Promise<void> {
	const found = findProposal(uri);
	if (found) await closeProposal(found[0]);
}

function findProposal(uri?: vscode.Uri): [vscode.TextDocument, Proposal] | undefined {
	const key = (uri ?? vscode.window.activeTextEditor?.document.uri)?.toString();
	const proposal = key ? proposals.get(key) : undefined;
	const doc = proposal ? vscode.workspace.textDocuments.find(d => d.uri.toString() === key) : undefined;
	if (!doc || !proposal) {
		void vscode.window.showWarningMessage('This is not an open Atomize improvement proposal.');
		return undefined;
	}
	return [doc, proposal];
}

/**
 * Closes the diff without offering to save the proposal, which only ever lived in memory. The
 * title-bar actions run with the diff active, so reverting and closing it discards the untitled
 * proposal in one step; any other tab still showing it is closed once nothing is left to save.
 */
async function closeProposal(proposalDoc: vscode.TextDocument): Promise<void> {
	const key = proposalDoc.uri.toString();
	proposals.delete(key);
	await publishProposals();

	const showsProposal = (tab: vscode.Tab) => (tab.input instanceof vscode.TabInputTextDiff && tab.input.modified.toString() === key)
		|| (tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === key);
	const active = vscode.window.tabGroups.activeTabGroup.activeTab;
	if (active && showsProposal(active)) await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
	if (!proposalDoc.isClosed && proposalDoc.isDirty) {
		await vscode.window.showTextDocument(proposalDoc, { preview: true });
		await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
	}
	const remaining = vscode.window.tabGroups.all.flatMap(group => group.tabs).filter(showsProposal);
	if (remaining.length > 0) await vscode.window.tabGroups.close(remaining);
}

/** Publishes the open proposals' paths (an untitled document's path is its "Untitled-N" name) for the title-bar actions. */
async function publishProposals(): Promise<void> {
	const paths = [...proposals.keys()].map(key => vscode.Uri.parse(key).path);
	await vscode.commands.executeCommand('setContext', PROPOSALS_CONTEXT, paths);
}
