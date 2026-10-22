---
title: Draft and improve with AI from the CLI
description: Draft a Template with atomize template create --ai or review an AI-proposed improvement with atomize template improve, choosing Project Grounding and Reference Documents for each run.
editUrl: false
---

Describe the Template you need and let Copilot write the first draft, or ask it to propose improvements to an existing Template. You review every draft and proposal before anything is saved.

## Before you start

- **GitHub Copilot:** an active Copilot subscription. Interactive runs start Copilot sign-in when needed. Copilot is not a Connection Profile: see [how the Copilot Session works](/connections/profiles/#ai-drafting-copilot-session).
- **Project Grounding (optional):** a [Connection Profile](/connections/profiles/) with the [Project and Team (Read) scope](/connections/#required-permissions), chosen with `--profile` or your default profile.
- **Wiki pages (optional):** the optional **Wiki (Read)** scope on the same token. Local Markdown and text files need no connection.

You choose the Grounding for every run. Copilot receives your description or guidance, the Template being improved, the project's names and allowed values, and the Reference Documents you keep. It never receives your token, Stories, or other work items.

## Draft a Template

<!-- atomize:include creation-ai -->

<!-- atomize:include cli-template-improve -->

## Related

Validate and preview the result with [`validate` and `preview`](/cli/reference/preview-validate/), then [generate Tasks](/cli/generate/). If Copilot sign-in, grounding, or a Reference Document fails, see [AI template generation fails](/cli/reference/#ai-template-generation-fails).
