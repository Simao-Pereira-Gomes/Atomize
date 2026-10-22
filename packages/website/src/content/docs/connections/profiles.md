---
title: Set up Connection Profiles
description: Add, test, rotate, and remove Azure DevOps Connection Profiles in the CLI, Atomize Studio, and VS Code, and see where each tool stores tokens.
editUrl: false
---

A Connection Profile names one Azure DevOps project and keeps its access token outside your Templates. Create the token first with the [required permissions](/connections/#required-permissions), then follow the steps for your tool.

<!-- atomize:include auth-setup -->

## Credential storage

<!-- atomize:include auth-storage -->

## Shared between the CLI and Atomize Studio

<!-- atomize:include auth-shared -->

## VS Code profiles

<!-- atomize:include auth-vscode -->

## Rotating tokens

<!-- atomize:include auth-rotation -->

## AI drafting: Copilot Session

<!-- atomize:include auth-copilot -->

## Continue with a connection

Each tool shows the planned Tasks before it creates any:

- **Studio**: [generate Tasks](/studio/generate/) from a Preview Source and Generate Scope. Studio shows a Live Preview, then Live Execution Confirmation, before creating Tasks.
- **VS Code**: run a [Live Preview](/vscode/generate/#preview-against-a-real-story), then [generate Tasks](/vscode/generate/#generate-tasks) when the plan is ready.
- **CLI**: follow [connected generation](/cli/generate/). A dry run reads Stories without creating Tasks.

If a connection fails, see [Fix connection problems](/connections/troubleshooting/).
