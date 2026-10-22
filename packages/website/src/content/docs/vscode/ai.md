---
title: Draft and improve with AI in VS Code
description: Draft a new Template or improve an open one with GitHub Copilot in VS Code, choosing the grounding and Reference Documents for each run and reviewing the proposal in the diff editor.
editUrl: false
---

Describe the Template you need and let Copilot write the first draft, or ask it to propose improvements to the open Template. Drafts open as unsaved files, and improvements open in the diff editor, so you review everything before it reaches your file.

## Before you start

- **GitHub Copilot:** GitHub Copilot Chat installed and signed in to a Copilot account in VS Code. Copilot is not a Connection Profile, and Atomize stores no Copilot token. See [how the Copilot Session works](/connections/profiles/#ai-drafting-copilot-session).
- **Project Grounding (optional):** a [Connection Profile](/connections/profiles/#vs-code) with the [Project and Team (Read) scope](/connections/#required-permissions). Without one, choose **No project grounding** or **No grounding**.
- **Wiki pages (optional):** the optional **Wiki (Read)** scope on the same token. Local Markdown and text files need no connection, only an open workspace folder.

You choose the Grounding for every run. Copilot receives your description or focus, the Template being improved, the project's names and allowed values, and the Reference Documents you leave ticked. It never receives your token, Stories, or other work items.

<!-- atomize:include vscode-ai -->

## Related

Check a draft with [schema hovers and Offline Validation](/vscode/author-yaml/) and a [Mock Preview](/getting-started/vscode/), inspect a composed result with [Show Effective Template](/vscode/inspect-templates/#inspect-the-resolved-template), then [generate Tasks](/vscode/generate/). For connection problems, see [Fix connection problems](/connections/troubleshooting/).
