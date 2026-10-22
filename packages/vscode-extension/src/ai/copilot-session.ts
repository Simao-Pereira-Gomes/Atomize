import type { AITemplateSession } from '@sppg2001/atomize-core/services/template/ai-template-loop';
import { CancellationError } from '@sppg2001/atomize-core/utils/errors';
import type * as vscode from 'vscode';

/** The `atomize.ai.model` value meaning "let Atomize pick an available Copilot model". */
export const AUTOMATIC_MODEL = 'auto';

/** Shown by VS Code when it asks the user to let Atomize use Copilot's language models. */
const JUSTIFICATION = 'Atomize sends your description to Copilot to draft or improve a Template.';

export type AIUnavailableReason = 'no-models' | 'model-unavailable' | 'no-permission' | 'blocked' | 'too-large' | 'failed';

const TOO_LARGE_ADVICE = 'Try again with fewer Reference Documents or without project grounding, or choose a Copilot model with a larger limit in atomize.ai.model.';

/** Why AI can't be used right now, so the command can offer the matching action. */
export class AIUnavailableError extends Error {
	constructor(readonly reason: AIUnavailableReason, message: string, readonly model?: string) {
		super(message);
		this.name = 'AIUnavailableError';
	}
}

/** A Copilot Session hosted by VS Code's Language Model API (ADR-0068): no tools, no stored token. */
export interface CopilotLmSession extends AITemplateSession {
	readonly modelName: string;
	abort(): void;
	dispose(): void;
}

/** The parts of VS Code's runtime a Copilot session uses, passed in so the session is testable without VS Code. */
export interface LanguageModelRuntime {
	selectChatModels(selector: vscode.LanguageModelChatSelector): Thenable<vscode.LanguageModelChat[]>;
	createCancellationTokenSource(): vscode.CancellationTokenSource;
	userMessage(content: string): vscode.LanguageModelChatMessage;
}

/**
 * Picks the Copilot model named by `atomize.ai.model` (a model family, or "auto") and opens a
 * session on it. Grounded requests carry project metadata and Reference Documents, so
 * "auto" chooses the available model with the largest input limit rather than whichever is listed first.
 */
export async function openCopilotSession(lm: LanguageModelRuntime, modelPreference: string): Promise<CopilotLmSession> {
	const pinned = modelPreference.trim() && modelPreference.trim() !== AUTOMATIC_MODEL ? modelPreference.trim() : undefined;
	const models = await lm.selectChatModels(pinned ? { vendor: 'copilot', family: pinned } : { vendor: 'copilot' });
	const model = pinned ? models[0] : largestInput(models);
	if (model) return new LmSession(lm, model);

	if (pinned && (await lm.selectChatModels({ vendor: 'copilot' })).length > 0) {
		throw new AIUnavailableError('model-unavailable', `The Copilot model "${pinned}" set in atomize.ai.model isn't available.`, pinned);
	}
	throw new AIUnavailableError('no-models', "Atomize's AI features need GitHub Copilot Chat, signed in to a Copilot account.");
}

function largestInput(models: vscode.LanguageModelChat[]): vscode.LanguageModelChat | undefined {
	return models.reduce<vscode.LanguageModelChat | undefined>(
		(best, candidate) => (!best || (candidate.maxInputTokens ?? 0) > (best.maxInputTokens ?? 0) ? candidate : best),
		undefined,
	);
}

class LmSession implements CopilotLmSession {
	private readonly cancellation: vscode.CancellationTokenSource;

	constructor(private readonly lm: LanguageModelRuntime, private readonly model: vscode.LanguageModelChat) {
		this.cancellation = lm.createCancellationTokenSource();
	}

	get modelName(): string {
		return this.model.name;
	}

	async generate(systemPrompt: string, userPrompt: string): Promise<string> {
		let output = '';
		for await (const chunk of this.stream(systemPrompt, userPrompt)) output += chunk;
		return output;
	}

	async *stream(systemPrompt: string, userPrompt: string): AsyncIterable<string> {
		// The Language Model API has no system role, so the instructions travel as the first user message.
		const messages = [this.lm.userMessage(systemPrompt), this.lm.userMessage(userPrompt)];
		await this.ensureFits([systemPrompt, userPrompt]);
		try {
			const response = await this.model.sendRequest(messages, { justification: JUSTIFICATION }, this.cancellation.token);
			for await (const chunk of response.text) {
				if (this.cancellation.token.isCancellationRequested) break;
				yield chunk;
			}
		} catch (error) {
			throw this.cancellation.token.isCancellationRequested ? new CancellationError('AI request cancelled') : toAIUnavailable(error, this.model.family);
		}
		if (this.cancellation.token.isCancellationRequested) throw new CancellationError('AI request cancelled');
	}

	abort(): void {
		this.cancellation.cancel();
	}

	/** Checks the request against the model's input limit before sending, so an oversized one gets a clear reason. */
	private async ensureFits(parts: string[]): Promise<void> {
		const limit = this.model.maxInputTokens;
		if (typeof this.model.countTokens !== 'function' || !limit) return;
		let used = 0;
		for (const part of parts) used += await this.model.countTokens(part, this.cancellation.token);
		if (used > limit) {
			throw new AIUnavailableError(
				'too-large',
				`This request is too large for ${this.model.name} (about ${used.toLocaleString('en-US')} of ${limit.toLocaleString('en-US')} tokens). ${TOO_LARGE_ADVICE}`,
				this.model.family,
			);
		}
	}

	dispose(): void {
		this.cancellation.dispose();
	}
}

export function toAIUnavailable(error: unknown, model?: string): AIUnavailableError {
	const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : undefined;
	const message = error instanceof Error ? error.message : String(error);
	if (/token limit|exceeds .*tokens?|context (length|window)|too (large|long)/i.test(message)) {
		return new AIUnavailableError('too-large', `This request is too large for the Copilot model. ${TOO_LARGE_ADVICE}`, model);
	}
	switch (code) {
		case 'NoPermissions':
			return new AIUnavailableError('no-permission', "Atomize doesn't have permission to use Copilot's language models.");
		case 'Blocked':
			return new AIUnavailableError('blocked', `Copilot declined the request: ${message}`);
		case 'NotFound':
			return new AIUnavailableError('model-unavailable', `The Copilot model "${model ?? ''}" isn't available.`, model);
		default:
			return new AIUnavailableError('failed', `Copilot couldn't complete the request: ${message}`);
	}
}
