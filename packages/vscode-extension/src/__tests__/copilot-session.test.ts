import { describe, expect, it } from 'bun:test';
import { CancellationError } from '@sppg2001/atomize-core/utils/errors';
import { type AIUnavailableError, openCopilotSession, type CopilotLmSession as Session } from '../ai/copilot-session.js';

class FakeCancellationTokenSource {
	token = { isCancellationRequested: false };
	cancel() { this.token.isCancellationRequested = true; }
	dispose() {}
}

interface FakeModel {
	name: string;
	family: string;
	maxInputTokens?: number;
	countTokens?: (text: string) => Promise<number>;
	requests: { messages: unknown[]; options: Record<string, unknown> }[];
	sendRequest: (messages: unknown[], options: Record<string, unknown>, token: { isCancellationRequested: boolean }) => Promise<{ text: AsyncIterable<string> }>;
}

function model(family: string, chunks: string[] = ['ok'], fail?: unknown): FakeModel {
	const fake: FakeModel = {
		name: `Model ${family}`,
		family,
		requests: [],
		sendRequest: async (messages, options) => {
			fake.requests.push({ messages, options });
			if (fail) throw fail;
			return { text: (async function* () { for (const chunk of chunks) yield chunk; })() };
		},
	};
	return fake;
}

/** A language model runtime whose Copilot models are the given ones, filterable by family. */
function languageModels(models: FakeModel[]) {
	const selectors: unknown[] = [];
	return {
		selectors,
		selectChatModels: async (selector?: { vendor?: string; family?: string }) => {
			selectors.push(selector);
			return models.filter(m => !selector?.family || m.family === selector.family) as never;
		},
		createCancellationTokenSource: () => new FakeCancellationTokenSource() as never,
		userMessage: (content: string) => ({ role: 'user', content }) as never,
	};
}

async function rejection(promise: Promise<unknown>): Promise<AIUnavailableError> {
	try {
		await promise;
	} catch (error) {
		return error as AIUnavailableError;
	}
	throw new Error('expected a rejection');
}

describe('openCopilotSession', () => {
	it('uses the first Copilot model when the preference is automatic and none reports a limit', async () => {
		const lm = languageModels([model('gpt-4o'), model('claude-sonnet-4')]);
		const session = await openCopilotSession(lm, 'auto');
		expect(session.modelName).toBe('Model gpt-4o');
		expect(lm.selectors).toEqual([{ vendor: 'copilot' }]);
	});

	it('chooses the model with the largest input limit when automatic, not the first listed', async () => {
		const small = { ...model('gpt-4o-mini'), maxInputTokens: 12_000 };
		const large = { ...model('claude-sonnet-4'), maxInputTokens: 128_000 };
		const medium = { ...model('gpt-4o'), maxInputTokens: 64_000 };
		const session = await openCopilotSession(languageModels([small, large, medium]), 'auto');
		expect(session.modelName).toBe('Model claude-sonnet-4');
	});

	it('keeps a pinned family even when another model has a larger limit', async () => {
		const small = { ...model('gpt-4o-mini'), maxInputTokens: 12_000 };
		const large = { ...model('claude-sonnet-4'), maxInputTokens: 128_000 };
		const session = await openCopilotSession(languageModels([small, large]), 'gpt-4o-mini');
		expect(session.modelName).toBe('Model gpt-4o-mini');
	});

	it('uses the pinned model family when it is available', async () => {
		const lm = languageModels([model('gpt-4o'), model('claude-sonnet-4')]);
		const session = await openCopilotSession(lm, 'claude-sonnet-4');
		expect(session.modelName).toBe('Model claude-sonnet-4');
		expect(lm.selectors[0]).toEqual({ vendor: 'copilot', family: 'claude-sonnet-4' });
	});

	it('reports a pinned family that is not available while other models are', async () => {
		const error = await rejection(openCopilotSession(languageModels([model('gpt-4o')]), 'o9-preview'));
		expect(error.name).toBe('AIUnavailableError');
		expect(error.reason).toBe('model-unavailable');
		expect(error.model).toBe('o9-preview');
	});

	it('reports that Copilot Chat is needed when no Copilot model is available', async () => {
		const error = await rejection(openCopilotSession(languageModels([]), 'auto'));
		expect(error.reason).toBe('no-models');
		expect((await rejection(openCopilotSession(languageModels([]), 'gpt-4o'))).reason).toBe('no-models');
	});
});

describe('Copilot Lm session', () => {
	it('sends the instructions and the request as user messages, with a justification and no tools', async () => {
		const fake = model('gpt-4o', ['version: ', '"1.0"']);
		const session: Session = await openCopilotSession(languageModels([fake]), 'auto');

		expect(await session.generate('SYSTEM', 'USER')).toBe('version: "1.0"');
		expect(fake.requests[0]?.messages).toEqual([{ role: 'user', content: 'SYSTEM' }, { role: 'user', content: 'USER' }]);
		expect(fake.requests[0]?.options.justification).toBeString();
		expect(fake.requests[0]?.options.tools).toBeUndefined();
	});

	it('streams the response text', async () => {
		const session = await openCopilotSession(languageModels([model('gpt-4o', ['a', 'b', 'c'])]), 'auto');
		const chunks: string[] = [];
		for await (const chunk of session.stream?.('S', 'U') ?? []) chunks.push(chunk);
		expect(chunks).toEqual(['a', 'b', 'c']);
	});

	it.each([
		['NoPermissions', 'no-permission'],
		['Blocked', 'blocked'],
		['NotFound', 'model-unavailable'],
		['SomethingElse', 'failed'],
	])('maps a %s language model error to %s', async (code, reason) => {
		const failure = Object.assign(new Error('rate limit exceeded'), { code });
		const session = await openCopilotSession(languageModels([model('gpt-4o', [], failure)]), 'auto');
		const error = await rejection(session.generate('S', 'U'));
		expect(error.name).toBe('AIUnavailableError');
		expect(error.reason).toBe(reason as never);
	});

	it("shows the provider's message when Copilot blocks the request", async () => {
		const failure = Object.assign(new Error('rate limit exceeded'), { code: 'Blocked' });
		const session = await openCopilotSession(languageModels([model('gpt-4o', [], failure)]), 'auto');
		expect((await rejection(session.generate('S', 'U'))).message).toContain('rate limit exceeded');
	});

	it('stops streaming and reports cancellation once aborted', async () => {
		const session = await openCopilotSession(languageModels([model('gpt-4o', ['a', 'b', 'c'])]), 'auto');
		const chunks: string[] = [];
		const consume = async () => {
			for await (const chunk of session.stream?.('S', 'U') ?? []) {
				chunks.push(chunk);
				session.abort();
			}
		};
		await expect(consume()).rejects.toBeInstanceOf(CancellationError);
		expect(chunks).toEqual(['a']);
	});

	it('refuses a request larger than the model accepts, before sending it', async () => {
		const fake = { ...model('gpt-4o'), maxInputTokens: 1000, countTokens: async (text: string) => text.length };
		const session = await openCopilotSession(languageModels([fake]), 'auto');
		const error = await rejection(session.generate('S'.repeat(800), 'U'.repeat(400)));
		expect(error.reason).toBe('too-large');
		expect(error.message).toContain('1,200 of 1,000 tokens');
		expect(fake.requests).toHaveLength(0);
	});

	it('sends a request that fits', async () => {
		const fake = { ...model('gpt-4o', ['ok']), maxInputTokens: 1000, countTokens: async (text: string) => text.length };
		const session = await openCopilotSession(languageModels([fake]), 'auto');
		expect(await session.generate('S', 'U')).toBe('ok');
	});

	it("explains a provider's token-limit error instead of passing it through", async () => {
		const failure = new Error('Message exceeds token limit.');
		const session = await openCopilotSession(languageModels([model('gpt-4o', [], failure)]), 'auto');
		const error = await rejection(session.generate('S', 'U'));
		expect(error.reason).toBe('too-large');
		expect(error.message).toContain('fewer Reference Documents or without project grounding');
		expect(error.message).not.toContain('Stories');
	});
});
