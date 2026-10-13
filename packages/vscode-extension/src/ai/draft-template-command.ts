import { draftTemplate } from '@sppg2001/atomize-core/services/template/ai-template-loop';
import { MAX_ATTEMPTS } from '@sppg2001/atomize-core/services/template/llm-template-generator';
import type { DocumentGrounding } from '@sppg2001/atomize-core/services/template/reference-documents';
import { CancellationError } from '@sppg2001/atomize-core/utils/errors';
import * as vscode from 'vscode';
import { getAIModel } from '../config/atomize-configuration.js';
import { type AIGrounding, type AIGroundingDeps, chooseAIGrounding } from './ai-grounding.js';
import { AIUnavailableError, type CopilotLmSession, openCopilotSession } from './copilot-session.js';
import { languageModels, offerFix } from './copilot-support.js';
import { draftDocumentContent } from './draft-document.js';
import { draftDescriptionPlaceholder, type GroundingContext, groundingContext, groundingSummary } from './grounding-context.js';
import { isPromptDocument, promptDocumentContent, promptDocumentDescription } from './prompt-document.js';
import { chooseReferenceDocuments } from './reference-documents-step.js';

const TITLE = 'Atomize: Draft Template with AI';
const COMMAND = 'atomize.draftTemplateWithAI';

export type DraftCommandDeps = AIGroundingDeps;

/** The last description entered this session, so a disappointing or failed draft never loses it. */
let lastDescription = '';

type ChosenGrounding = AIGrounding & { documentGrounding: DocumentGrounding | null };

/** The Grounding a prompt document was opened with, keyed by its URI, so drafting from it doesn't ask again. */
const promptGrounding = new Map<string, ChosenGrounding>();

export function registerDraftTemplateCommand(deps: DraftCommandDeps): vscode.Disposable {
	return vscode.Disposable.from(
		vscode.commands.registerCommand(COMMAND, (promptDocument?: vscode.Uri) => draftTemplateWithAI(deps, promptDocument)),
		vscode.languages.registerCodeLensProvider({ language: 'markdown' }, new PromptDocumentCodeLensProvider()),
		vscode.workspace.onDidCloseTextDocument(doc => promptGrounding.delete(doc.uri.toString())),
	);
}

/** Offers "Draft Template with AI" at the top of a prompt document. */
class PromptDocumentCodeLensProvider implements vscode.CodeLensProvider {
	provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
		if (!isPromptDocument(document.getText())) return [];
		return [new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), { title: TITLE, command: COMMAND, arguments: [document.uri] })];
	}
}

/**
 * Grounding first, then the description, so the description can refer to the Stories and
 * documents just chosen. A prompt document keeps the Grounding it was opened with.
 */
async function draftTemplateWithAI(deps: DraftCommandDeps, promptDocument?: vscode.Uri): Promise<void> {
	const key = promptDocument?.toString();
	const grounding = (key ? promptGrounding.get(key) : undefined) ?? await chooseGrounding(deps, promptDocument);
	if (!grounding) return;
	if (key) promptGrounding.set(key, grounding);

	const context = groundingContext(grounding, grounding.documentGrounding);
	const description = promptDocument ? await describeFromDocument(promptDocument) : await describeInInputBox(grounding, context);
	if (description === undefined) return;
	lastDescription = description;

	let content: string | undefined;
	try {
		content = await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: TITLE, cancellable: true },
			(progress, token) => runDraft(description, grounding, progress, token),
		);
	} catch (error) {
		if (error instanceof AIUnavailableError) {
			await offerFix(error, () => draftTemplateWithAI(deps, promptDocument));
			return;
		}
		throw error;
	}
	if (content === undefined) return;

	const document = await vscode.workspace.openTextDocument({ language: 'yaml', content });
	await vscode.window.showTextDocument(document);
}

async function chooseGrounding(deps: DraftCommandDeps, promptDocument: vscode.Uri | undefined): Promise<ChosenGrounding | undefined> {
	const resource = promptDocument ?? vscode.window.activeTextEditor?.document.uri;
	const grounding = await chooseAIGrounding(deps, {
		title: TITLE,
		resource,
		noGrounding: { label: 'No project grounding', description: 'Draft from your description only' },
		storyPlaceholder: 'Optionally tick example Stories your team broke down well, or press Enter with none to skip.',
		purpose: 'The draft',
	});
	if (grounding === 'cancelled') return undefined;
	const documentGrounding = await chooseReferenceDocuments({ title: TITLE, resource, adapter: grounding.adapter });
	if (documentGrounding === undefined) return undefined;
	return { ...grounding, documentGrounding };
}

/**
 * Asks for the description in an InputBox, pre-filled with the last one and titled with the
 * chosen Grounding. Its "Open in editor" button moves the description into a prompt document for
 * longer writing instead, listing the Grounding at the top and keeping it for the draft.
 */
async function describeInInputBox(grounding: ChosenGrounding, context: GroundingContext): Promise<string | undefined> {
	const input = vscode.window.createInputBox();
	input.title = `${TITLE} · ${groundingSummary(context, 'No project grounding')}`;
	input.prompt = 'Describe the Template you need, or open an editor to write more';
	input.placeholder = draftDescriptionPlaceholder(context);
	input.value = lastDescription;
	input.ignoreFocusOut = true;
	const openEditor: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('go-to-file'), tooltip: 'Open in editor for a longer description' };
	input.buttons = [openEditor];

	const outcome = await new Promise<{ kind: 'text' | 'editor'; value: string } | undefined>(resolve => {
		input.onDidChangeValue(value => { input.validationMessage = undefined; lastDescription = value; });
		input.onDidAccept(() => {
			if (!input.value.trim()) {
				input.validationMessage = 'Describe the Template you need';
				return;
			}
			resolve({ kind: 'text', value: input.value });
			input.hide();
		});
		input.onDidTriggerButton(() => { resolve({ kind: 'editor', value: input.value }); input.hide(); });
		input.onDidHide(() => { resolve(undefined); input.dispose(); });
		input.show();
	});

	if (outcome?.kind !== 'editor') return outcome?.value;
	const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: promptDocumentContent(outcome.value, context) });
	promptGrounding.set(document.uri.toString(), grounding);
	await vscode.window.showTextDocument(document);
	return undefined;
}

async function describeFromDocument(uri: vscode.Uri): Promise<string | undefined> {
	const document = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString())
		?? await vscode.workspace.openTextDocument(uri);
	const description = promptDocumentDescription(document.getText());
	if (!description) {
		void vscode.window.showWarningMessage('Describe the Template below the first line, then choose Draft Template with AI again.');
		return undefined;
	}
	return description;
}

/** Resolves the draft's document text, or undefined when the user cancelled. */
async function runDraft(
	description: string,
	grounding: ChosenGrounding,
	progress: vscode.Progress<{ message?: string }>,
	token: vscode.CancellationToken,
): Promise<string | undefined> {
	const cancellation = new AbortController();
	let session: CopilotLmSession | undefined;
	const onCancel = token.onCancellationRequested(() => {
		cancellation.abort();
		session?.abort();
	});
	try {
		progress.report({ message: 'Connecting to Copilot…' });
		session = await openCopilotSession(languageModels, getAIModel());
		if (token.isCancellationRequested) return undefined;

		let received = 0;
		progress.report({ message: `Writing with ${session.modelName}…` });
		const result = await draftTemplate(session, {
			prose: description,
			projectGrounding: grounding.projectGrounding,
			storyGrounding: grounding.storyGrounding,
			documentGrounding: grounding.documentGrounding,
		}, {
			signal: cancellation.signal,
			onChunk: chunk => {
				received += chunk.length;
				progress.report({ message: `Writing with ${session?.modelName} (${received} characters)…` });
			},
			onRepairStart: attempt => progress.report({ message: `Fixing validation problems (attempt ${attempt} of ${MAX_ATTEMPTS})…` }),
		});
		return draftDocumentContent(result);
	} catch (error) {
		if (error instanceof CancellationError || cancellation.signal.aborted) return undefined;
		throw error;
	} finally {
		onCancel.dispose();
		session?.dispose();
	}
}
