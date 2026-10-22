---
title: Troubleshooting
description: Find the recovery steps for installation, validation, preview, generation, connection, AI, and editor problems in each Atomize tool.
editUrl: false
---

Start from the kind of problem you see. Offline authoring and Mock Preview never need a connection, so a connection problem doesn't stop you from editing or previewing a Template.

| Problem | Where to look |
| --- | --- |
| The `atomize` command isn't found, or the CLI won't install | [Atomize command not found](#atomize-command-not-found) and the [CLI quickstart](/getting-started/cli/) |
| A Template fails validation | [Fix validation errors](/validation/errors/) |
| Validation says custom fields or queries could not be verified | [Offline and Online Validation](/validation/#offline-and-online-validation) |
| A preview or the Resolved Template can't be produced | [Offline commands cannot complete](/vscode/settings-recovery/#offline-commands-cannot-complete) and [Compose Templates](/reference/templates/composition/#inspect-composition-in-your-tool) |
| No Stories match, or generation stops partway | [No Stories found](#no-stories-found) and [Generate Tasks from the CLI](/cli/generate/) |
| A profile, token, or permission fails | [Fix connection problems](/connections/troubleshooting/) |
| Copilot sign-in, grounding, or a Reference Document fails | [AI template generation fails](/cli/reference/#ai-template-generation-fails) |
| VS Code hovers, completions, or CodeLens actions are missing | [VS Code troubleshooting](/vscode/settings-recovery/#troubleshoot-the-offline-workflow) |

<!-- atomize:feature studio -->

Atomize Studio's companion process and AI recovery are covered in [Studio settings and recovery](/studio/settings-recovery/#companion-process-recovery) and [Draft and improve with AI in Studio](/studio/ai/).

<!-- /atomize:feature -->

<!-- atomize:include workflow-troubleshooting -->

## Still stuck

Search this site for the exact message, or [open an issue](https://github.com/Simao-Pereira-Gomes/Atomize/issues) with the message, the Template YAML, and the command or action you ran. Never include an access token.
