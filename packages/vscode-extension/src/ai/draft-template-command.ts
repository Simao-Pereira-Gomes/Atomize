import { draftTemplate } from '@sppg2001/atomize-core/services/template/ai-template-loop';
import { MAX_ATTEMPTS } from '@sppg2001/atomize-core/services/template/llm-template-generator';
import { CancellationError } from '@sppg2001/atomize-core/utils/errors';
import * as vscode from 'vscode';
import { getAIModel } from '../config/atomize-configuration.js';
import { AIUnavailableError, AUTOMATIC_MODEL, type CopilotLmSession, type LanguageModelRuntime, openCopilotSession } from './copilot-session.js';
import { draftDocumentContent } from './draft-document.js';

const TITLE = 'Atomize: Draft Template with AI';
const COPILOT_CHAT_EXTENSION = 'GitHub.copilot-chat';

const languageModels: LanguageModelRuntime = {
	selectChatModels: selector => vscode.lm.selectChatModels(selector),
	createCancellationTokenSource: () => new vscode.CancellationTokenSource(),
	userMessage: content => vscode.LanguageModelChatMessage.User(content),
};

/** The last description entered this session, so a disappointing or failed draft never loses it. */
let lastDescription = '';

export function registerDraftTemplateCommand(): vscode.Disposable {
	return vscode.commands.registerCommand('atomize.draftTemplateWithAI', () => draftTemplateWithAI());
}

async function draftTemplateWithAI(): Promise<void> {
	const description = await vscode.window.showInputBox({
		title: TITLE,
		prompt: 'Describe the Template you need',
		placeHolder: 'e.g. Backend API stories with design, implementation, and testing tasks',
		value: lastDescription,
		ignoreFocusOut: true,
		validateInput: (value): string | undefined => (value.trim() ? undefined : 'Describe the Template you need'),
	});
	if (description === undefined) return;
	lastDescription = description;

	let content: string | undefined;
	try {
		content = await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: TITLE, cancellable: true },
			(progress, token) => runDraft(description, progress, token),
		);
	} catch (error) {
		if (error instanceof AIUnavailableError) {
			await offerFix(error);
			return;
		}
		throw error;
	}
	if (content === undefined) return;

	const document = await vscode.workspace.openTextDocument({ language: 'yaml', content });
	await vscode.window.showTextDocument(document);
}

/** Resolves the draft's document text, or undefined when the user cancelled. */
async function runDraft(
	description: string,
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
		const result = await draftTemplate(session, { prose: description }, {
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

async function offerFix(error: AIUnavailableError): Promise<void> {
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
				await draftTemplateWithAI();
			} else if (choice === 'Open Settings') {
				await vscode.commands.executeCommand('workbench.action.openSettings', 'atomize.ai.model');
			}
			return;
		}
		case 'no-permission': {
			const choice = await vscode.window.showErrorMessage(error.message, 'Try Again');
			if (choice) await draftTemplateWithAI();
			return;
		}
		default:
			await vscode.window.showErrorMessage(error.message);
	}
}
