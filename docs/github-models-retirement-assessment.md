# GitHub Models retirement assessment

**Status:** resolved — implemented via [ADR-0044](./adr/0044-copilot-sdk-for-ai-template-drafting.md). AI-assisted template drafting now authenticates through a GitHub Copilot SDK sign-in (a Copilot Session, see [Auth Guide](./Auth-Guide.md#ai-drafting-copilot-session)) instead of a GitHub Models Connection Profile. Kept below as the original decision input for issue #147.
**Assessed:** 2026-08-13
**Scope:** Atomize's current AI-template-generation provider only. No production changes are made by this assessment.

## Finding

GitHub Models is not a viable provider for Atomize. GitHub fully retired its playground, model catalog, inference API, and BYOK endpoints for every customer on **30 July 2026**. GitHub directs projects needing model access to Microsoft Foundry; GitHub Copilot is a separate service and not a substitute for this application API. [GitHub retirement notice](https://github.blog/changelog/2026-07-01-github-models-is-being-fully-retired-on-july-30-2026/) [GitHub Models documentation](https://docs.github.com/en/github-models)

The implementation is already on an unsupported endpoint: it sends requests and lists models through `https://models.inference.ai.azure.com`. GitHub deprecated that Azure endpoint on 17 July 2025 and removed support on 17 October 2025. The successor `models.github.ai` endpoint was itself retired with GitHub Models, so simply changing the base URL cannot fix Atomize. [GitHub endpoint deprecation notice](https://github.blog/changelog/2025-07-17-deprecation-of-azure-endpoint-for-github-models/)

## Current Atomize coupling

The CLI treats an AI Connection Profile as `platform: "github-models"` plus a GitHub PAT and an optional model. The same obsolete endpoint is used for profile setup (model listing), connectivity testing, inference, user guidance, and documentation. The provider contract is intentionally small: non-streaming generation, streaming generation, and optional connectivity testing.

Therefore, #147 should not promise unchanged GitHub Models behavior. It should extract a provider boundary while replacing the obsolete `github-models` configuration and user surface, including a migration policy for saved Connection Profiles.

## Viable direct providers

| Option | Fit with current provider | New Connection Profile data | Decision notes |
| --- | --- | --- | --- |
| Microsoft Foundry via OpenAI/v1 | Strongest replacement: GitHub explicitly recommends Foundry, and Atomize already depends on the `openai` JavaScript SDK. The existing chat-completions implementation can be adapted to a Foundry OpenAI/v1 base URL. | Resource/project endpoint, deployment name (used as `model`), and either API key or a distinct Entra-auth design. | Recommended default. Foundry requires an Azure subscription, a Foundry resource, and a deployed model. API keys are simplest but Microsoft recommends Entra ID for production; choosing credential mode is a product decision. [Foundry endpoints](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/endpoints) |
| Direct OpenAI API | Also compatible with the existing `openai` dependency, with an OpenAI API key and a model identifier. | API key and model. | Good independent-provider alternative, but introduces direct OpenAI billing/account setup and requires an explicit decision on its public support. The official SDK's current primary API is Responses, so adopting it would be a response/stream mapping change rather than a literal endpoint replacement. [OpenAI JavaScript quickstart](https://platform.openai.com/docs/quickstart/make-your-first-api-request) |

Microsoft specifically recommends the stable OpenAI SDK and GA `/openai/v1` API, rather than Azure AI Inference's beta SDK (which is retiring 26 August 2026). Foundry's OpenAI/v1 endpoints accept the standard OpenAI JavaScript SDK, use a deployment name in the `model` field, and support API-key or Entra ID authentication. [Foundry endpoints](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/endpoints)

## Additional provider comparison

All three services below can meet Atomize's narrow text-generation and streaming contract. Their differences matter at the package boundary: Anthropic and Gemini use provider-native SDKs and request shapes, while OpenRouter is compatible with Atomize's existing OpenAI SDK.

| Provider | Node API and credentials | Streaming and portability | Operational/pricing facts from provider documentation |
| --- | --- | --- | --- |
| Anthropic API | `@anthropic-ai/sdk` is Anthropic's TypeScript/JavaScript SDK for the Messages API. It accepts `ANTHROPIC_API_KEY` (or an explicit `apiKey`) and requires a different request shape from OpenAI Chat Completions. | The Messages API streams SSE when `stream: true`; the official SDK provides streaming support. This is a single-vendor Claude surface, so changing model providers needs another adapter or a compatibility layer. [SDK](https://github.com/anthropics/anthropic-sdk-typescript) [streaming](https://platform.claude.com/docs/en/build-with-claude/streaming) | Anthropic publishes token prices by Claude model and usage tier; input/output, prompt-cache, and some server-tool usage are separately priced. The actual spend therefore depends on the selected Claude model and features. [pricing](https://docs.anthropic.com/en/docs/about-claude/pricing) |
| Google Gemini API | Google's `@google/genai` JavaScript SDK accepts a Gemini API key (`GEMINI_API_KEY` or explicit `apiKey`). Gemini keys are associated with a Google Cloud project; Google documents both standard and service-account-bound authorization keys. | The Gemini SDK exposes async streaming through `generateContentStream` (or the newer Interactions API stream). Its native request/response shape differs from Atomize's current OpenAI Chat Completions call, requiring an adapter. It is a Gemini-only direct API. [key authentication](https://ai.google.dev/gemini-api/docs/api-key) [text generation](https://ai.google.dev/gemini-api/docs/text-generation) | Google AI Studio creates a project and key; paid-tier access requires Cloud Billing, increases rate limits, and exposes usage in AI Studio. [getting started](https://ai.google.dev/gemini-api/docs/get-started) |
| OpenRouter | OpenRouter accepts an `OPENROUTER_API_KEY` as a Bearer token. It offers a TypeScript SDK, but its documentation also shows the existing `openai` SDK configured with the OpenRouter base URL, so Atomize's current provider implementation is near-drop-in. | Its Chat Completions API is OpenAI-compatible and streams by SSE with `stream: true`. One model slug selects models from different providers; it also exposes a model-list endpoint and documents routing/fallbacks. This is the strongest portability option at the cost of inserting a gateway between Atomize and the underlying model vendor. [quickstart](https://openrouter.ai/docs/quickstart) [FAQ](https://openrouter.ai/docs/faq) | OpenRouter states that it passes through underlying inference prices, charges a fee when credits are purchased, and has distinct BYOK fees after the stated free allowance. It is also responsible for account credits, routing, and fallback behavior. [FAQ](https://openrouter.ai/docs/faq) [BYOK](https://openrouter.ai/docs/guides/overview/auth/byok) |

### Implications of the comparison

- **Fastest repair:** Foundry/OpenAI-v1 or OpenRouter can preserve Atomize's `openai` dependency and Chat Completions/async-iterator mechanics. They are not equivalent product choices: Foundry is an Azure deployment model; OpenRouter is a multi-provider gateway with gateway billing and routing.
- **Direct-provider breadth:** supporting Anthropic and Gemini is feasible, but requires provider-specific adapters and dependencies (or a deliberately chosen compatibility layer). Do not hide their distinct credential, prompt, and streaming event models behind a config-only base-URL change.
- **Portability policy:** OpenRouter provides the only documented one-slug cross-provider routing option in this comparison. Direct Foundry, Anthropic, and Gemini profiles should each identify a model/deployment valid for that provider; they are not interchangeable identifiers.

## Decision implications for #147

1. Make provider configuration explicitly provider-specific. A generic `AIProviderConfig` should not preserve the `github-models` variant as a supported runtime option.
2. Select one initial production provider—recommend **Microsoft Foundry/OpenAI-v1 with API-key credentials**—and retain `mock` only for deterministic tests/development. Entra ID should be a separately designed credential flow, not silently treated as an API key.
3. Define saved-profile migration before implementation: either automatically reject legacy `github-models` profiles with an actionable reconfigure message, or introduce a versioned migration to a new Foundry profile. Do not attempt to reuse a GitHub PAT as an Azure credential.
4. Keep the exported provider abstraction (`AIProvider`, `AIProviderConfig`, `createAIProvider`) and root-only package surface decided during grilling. It now isolates the inevitable Foundry/OpenAI implementation differences from CLI and Studio consumers.
5. Update connection-profile prompts, validation, model selection, connectivity tests, CLI text, and documentation together. Foundry does not provide a universal anonymous catalog lookup equivalent to the former GitHub Models `/models` request; selection should be based on the configured deployment, with any discovery flow designed against the chosen Foundry resource/authentication mode.

## Recommended issue split

Keep #147 as the package extraction plus the first supported replacement provider, because shipping the existing provider would produce a package that cannot work in production. If its scope is kept narrow, create a blocking migration issue covering Connection Profile schema/versioning, user-facing migration UX, and documentation. Direct OpenAI and Entra-ID support are follow-up providers unless the product intentionally commits to supporting them now.
