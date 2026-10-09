import { draftTemplate } from '@sppg2001/atomize-core/services/template/ai-template-loop';
import { MAX_ATTEMPTS } from '@sppg2001/atomize-core/services/template/llm-template-generator';
import {
	fetchProjectGrounding,
	type ProjectGrounding,
	toProjectGroundingError,
} from '@sppg2001/atomize-core/services/template/project-grounding';
import { CancellationError } from '@sppg2001/atomize-core/utils/errors';
import * as vscode from 'vscode';
import { getAIModel, getDefaultProfile } from '../config/atomize-configuration.js';
import type { CredentialResolver } from '../profiles/credential-resolver.js';
import { pickProfile } from '../profiles/profile-picker.js';
import type { ProfileStore } from '../profiles/profile-store.js';
import { AIUnavailableError, AUTOMATIC_MODEL, type CopilotLmSession, type LanguageModelRuntime, openCopilotSession } from './copilot-session.js';
import { draftDocumentContent } from './draft-document.js';
import { isPromptDocument, promptDocumentContent, promptDocumentDescription } from './prompt-document.js';

const TITLE = 'Atomize: Draft Template with AI';
const COMMAND = 'atomize.draftTemplateWithAI';
const COPILOT_CHAT_EXTENSION = 'GitHub.copilot-chat';

const languageModels: LanguageModelRuntime = {
	selectChatModels: selector => vscode.lm.selectChatModels(selector),
	createCancellationTokenSource: () => new vscode.CancellationTokenSource(),
	userMessage: content => vscode.LanguageModelChatMessage.User(content),
};

export interface DraftCommandDeps {
	store: ProfileStore;
	credentialResolver: CredentialResolver;
}

/** The last description entered this session, so a disappointing or failed draft never loses it. */
let lastDescription = '';

export function registerDraftTemplateCommand(deps: DraftCommandDeps): vscode.Disposable {
	return vscode.Disposable.from(
		vscode.commands.registerCommand(COMMAND, (promptDocument?: vscode.Uri) => draftTemplateWithAI(deps, promptDocument)),
		vscode.languages.registerCodeLensProvider({ language: 'markdown' }, new PromptDocumentCodeLensProvider()),
	);
}

/** Offers "Draft Template with AI" at the top of a prompt document. */
class PromptDocumentCodeLensProvider implements vscode.CodeLensProvider {
	provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
		if (!isPromptDocument(document.getText())) return [];
		return [new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), { title: TITLE, command: COMMAND, arguments: [document.uri] })];
	}
}

async function draftTemplateWithAI(deps: DraftCommandDeps, promptDocument?: vscode.Uri): Promise<void> {
	const description = promptDocument ? await describeFromDocument(promptDocument) : await describeInInputBox();
	if (description === undefined) return;
	lastDescription = description;

	const grounding = await chooseGrounding(deps);
	if (grounding === 'cancelled') return;

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

/**
 * Asks for the description in an InputBox, pre-filled with the last one. Its "Open in editor"
 * button moves the description into a prompt document for longer writing instead.
 */
async function describeInInputBox(): Promise<string | undefined> {
	const input = vscode.window.createInputBox();
	input.title = TITLE;
	input.prompt = 'Describe the Template you need — or open an editor to write more';
	input.placeholder = 'e.g. Backend API stories with design, implementation, and testing tasks';
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
	const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: promptDocumentContent(outcome.value) });
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

/**
 * Project Grounding is always the user's explicit choice (ADR-0069): a Connection Profile, with the
 * Workspace Default focused, or no grounding. Grounding that can't load is retried, dropped, or
 * cancelled by the user, never dropped silently.
 */
async function chooseGrounding(deps: DraftCommandDeps): Promise<ProjectGrounding | null | 'cancelled'> {
	const profile = await pickProfile(deps.store, deps.credentialResolver, {
		title: `${TITLE} — Grounding`,
		allowOffline: true,
		defaultProfile: getDefaultProfile(vscode.window.activeTextEditor?.document.uri),
		offlineChoice: { label: 'No project grounding', description: 'Draft from your description only' },
	});
	if (profile === null) return 'cancelled';
	if (profile === undefined) return null;

	while (true) {
		try {
			return await vscode.window.withProgress(
				{ location: vscode.ProgressLocation.Notification, title: `Loading project metadata from "${profile}"…` },
				async () => fetchProjectGrounding(await deps.credentialResolver.resolveByName(profile)),
			);
		} catch (error) {
			const choice = await vscode.window.showWarningMessage(
				toProjectGroundingError(error).message,
				{ modal: true, detail: 'The draft was going to use this project\'s metadata.' },
				'Retry',
				'Continue without grounding',
			);
			if (choice === 'Continue without grounding') return null;
			if (choice !== 'Retry') return 'cancelled';
		}
	}
}

/** Resolves the draft's document text, or undefined when the user cancelled. */
async function runDraft(
	description: string,
	projectGrounding: ProjectGrounding | null,
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
		const result = await draftTemplate(session, { prose: description, projectGrounding }, {
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

async function offerFix(error: AIUnavailableError, retry: () => Promise<void>): Promise<void> {
	switch (error.reason) {
		case 'no-models': {
			const choice = await vscode.window.showErrorMessage(error.message, 'Install GitHub Copilot Chat');
			if (choice) await vscode.commands.executeCommand('extension.open', COPILOT_CHAT_EXTENSION);
			return;
		}
		case 'model-unavailable': {
			const choice = await vscode.window.showErrorMessage(error.message, 'Use Automatic', 'Open Settings');
			if (choice === 'Use Automatic') {
				await vscode.workspace.getConfiguration('atomize').update('ai.model', AUTOMATIC_MODEL, vscode.ConfigurationTarget.Global);
				await retry();
			} else if (choice === 'Open Settings') {
				await vscode.commands.executeCommand('workbench.action.openSettings', 'atomize.ai.model');
			}
			return;
		}
		case 'no-permission': {
			const choice = await vscode.window.showErrorMessage(error.message, 'Try Again');
			if (choice) await retry();
			return;
		}
		default:
			await vscode.window.showErrorMessage(error.message);
	}
}
