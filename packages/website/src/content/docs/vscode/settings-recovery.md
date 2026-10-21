---
title: VS Code validation, settings, and recovery
description: Run Offline Validation, configure preview and schema layouts, and recover missing authoring tools or failed offline commands.
editUrl: false
---

Check your Template offline before configuring a platform connection. Editor preferences control presentation; they do not change what the Template generates.

## Validate without a connection

<!-- atomize:include vscode-validation -->

## Configure the editor

Run **Atomize: Open Settings** from the Command Palette.

<!-- atomize:include vscode-settings -->

## Troubleshoot the offline workflow

<!-- atomize:include vscode-recovery -->

## Continue with a connection

Use [VS Code profile setup](/connections/profiles/#vs-code) for the extension's own Connection Profiles. Then run [Preview (Live)](https://github.com/Simao-Pereira-Gomes/Atomize/blob/main/docs/VS-Code-Extension.md#atomize-preview-live) before [Generate](https://github.com/Simao-Pereira-Gomes/Atomize/blob/main/docs/VS-Code-Extension.md#atomize-generate). [Fix connection problems](/connections/troubleshooting/) covers rejected tokens and missing permissions.
