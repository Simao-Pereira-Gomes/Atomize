import * as vscode from 'vscode';
import { AIUnavailableError, AUTOMATIC_MODEL, type LanguageModelRuntime } from './copilot-session.js';

const COPILOT_CHAT_EXTENSION = 'GitHub.copilot-chat';

/** VS Code's language model runtime, as the Copilot session uses it. */
export const languageModels: LanguageModelRuntime = {
	selectChatModels: selector => vscode.lm.selectChatModels(selector),
	createCancellationTokenSource: () => new vscode.CancellationTokenSource(),
	userMessage: content => vscode.LanguageModelChatMessage.User(content),
};

export { AIUnavailableError };

/** Explains why Copilot can't be used and offers the matching fix, retrying where that makes sense. */
export async function offerFix(error: AIUnavailableError, retry: () => Promise<void>): Promise<void> {
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
