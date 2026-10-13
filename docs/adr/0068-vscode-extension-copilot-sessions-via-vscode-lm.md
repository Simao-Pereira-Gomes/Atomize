# The VS Code extension hosts Copilot Sessions through `vscode.lm`, not the Copilot SDK

ADR-0044 put AI drafting on the GitHub Copilot SDK's bundled runtime, and the CLI and Atomize Studio both reach it through `@sppg2001/atomize-ai`. The VS Code extension does not. It hosts its Copilot Sessions through VS Code's own Language Model API (`vscode.lm.selectChatModels({ vendor: "copilot" })` and `sendRequest`), wrapped in a thin adapter that implements `atomize-ai`'s `AIDraftSession` shape. The prompt builders, Grounding and the repair loop in `atomize-core` are still shared unchanged. ADR-0044's guarantees all still hold: the session runs on the user's own Copilot subscription, Atomize holds no token, the session has no tools, and it is discarded after each draft or improvement. Only the runtime that hosts the session differs.

The SDK ships a native runtime for each platform as optional dependencies. The extension is packaged as a single esbuild bundle with `vsce package --no-dependencies`. Embedding the SDK would mean publishing a large, platform-specific VSIX for every target (`vsce --target`) and building a Copilot sign-in flow inside the extension, all to reproduce access to the model that the editor already gives to signed-in Copilot users.

## Considered Options

- **Reuse `@sppg2001/atomize-ai` and the Copilot SDK, as the CLI and Studio do.** Rejected because of the per-platform VSIX and binary-size cost and the duplicated sign-in flow described above.
- **Bring-your-own API key (OpenAI, Anthropic and others).** Rejected for the same reasons ADR-0044 gives: separate billing and credential storage.

## Consequences

- `engines.vscode` rises from `^1.85.0` to `^1.90.0`, the first release with a stable `vscode.lm`. AI features need GitHub Copilot Chat installed and the user's consent through VS Code's prompt. The commands stay visible and explain what is missing instead of being hidden.
- `selectChatModels` has no "automatic" choice, so ADR-0044's "no model preference" rule cannot be followed literally. The extension adds an `atomize.ai.model` setting that defaults to automatic. Only VS Code has it.
- The **Copilot Session** glossary entry no longer names a runtime. A future surface can choose whichever host suits its packaging, as long as the session stays credential-free and has no tools.
