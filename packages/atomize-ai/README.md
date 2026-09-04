# Atomize AI

The shared AI template-drafting client. Wraps the GitHub Copilot SDK behind a small provider interface so callers don't depend on `@github/copilot-sdk` directly.

## Exports

Single entry point (`.`, built to `dist/index.js`):

- `createAIProvider(config: AIProviderConfig): AIProvider` — factory. `AIProviderConfig` is `{ type: "github-copilot" }` or `{ type: "mock"; response?: string }` (the mock provider is for tests/offline use, not a retired production provider).
- `AIProvider`, `AIDraftSession` — the provider interface types.
- `GitHubCopilotProvider`, `CopilotAuthenticationError` — the GitHub Copilot SDK-backed implementation and its auth-failure error type.

There is no `github-models` provider — AI drafting was migrated off GitHub Models onto the Copilot SDK; see [ADR-0044](../../docs/adr/0044-copilot-sdk-for-ai-template-drafting.md).

## Consumers

- `cli` — direct dependency, used by `atomize template create --ai`.
- `atomize-sidecar` — direct dependency, used for AI drafting in Atomize Studio.
- **Not** a dependency of `vscode-extension` — the VS Code extension has no AI-drafting surface.

## Scripts

```bash
bun run typecheck
bun run build   # typecheck + bundle to dist/index.js, @github/copilot-sdk kept external
bun test
```
