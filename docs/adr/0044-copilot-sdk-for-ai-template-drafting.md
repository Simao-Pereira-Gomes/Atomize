# GitHub Copilot SDK for AI Template drafting

GitHub Models is retired and its former Azure inference endpoint is unsupported, so Atomize no longer treats GitHub Models as an AI Connection Profile. AI Template drafting uses the GitHub Copilot SDK's bundled runtime with the user's locally signed-in Copilot account: no Atomize-held token, model preference, or API-key fallback. Each draft runs in an ephemeral, tool-free session with automatic model selection; interactive Atomize runs initiate sign-in when needed, while non-interactive runs require a pre-existing sign-in. This keeps AI usage on the user's Copilot subscription and prevents drafting from gaining filesystem, shell, or external-service access.

## Considered Options

Microsoft Foundry, direct OpenAI, Anthropic, Gemini, and OpenRouter API-key providers were considered. They require separate API billing and credential storage; OpenRouter also introduces routing and billing intermediary behavior. Atomize supports no API-key fallback in this decision. A GitHub OAuth/App integration was also rejected for now because the bundled Copilot runtime can use the local signed-in user without Atomize operating OAuth-token lifecycle infrastructure.

## Consequences

Azure DevOps is the only supported Connection Profile type. Legacy GitHub Models records remain inert for explicit user cleanup and are never converted into Copilot credentials. The reusable `atomize-ai` package exposes credential-free Copilot and mock configurations, and a required authentication operation alongside generation and streaming.
