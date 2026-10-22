---
title: Connect Azure DevOps
description: See which platforms Atomize supports, what works without a connection, and which permissions a Connection Profile needs.
editUrl: false
---

You can author Templates and run Mock Preview without any connection. Connect a project when you want to preview real Stories, validate against project fields, or create Tasks.

## Supported platforms

<!-- atomize:include platform-support -->

<!-- atomize:include platform-mock -->

## Required permissions

<!-- atomize:include auth-permissions -->

## Set up your tool

Each tool manages Connection Profiles in its own place.<!-- atomize:feature studio --> The CLI and Atomize Studio share the same profiles, while VS Code keeps its own.<!-- /atomize:feature -->

- [Atomize Studio](/connections/profiles/#atomize-studio): add a work project from Global Settings. <!-- atomize:feature studio -->
- [VS Code](/connections/profiles/#vs-code): run **Atomize: Manage Profiles**, or import your CLI profiles once.
- [CLI](/connections/profiles/#atomize-cli): run `atomize auth add`, then [use profiles in scripts and CI](/connections/automation/).

Not connected yet? Start with a Mock Preview in <!-- atomize:feature studio -->[Studio](/getting-started/studio/), <!-- /atomize:feature -->[VS Code](/getting-started/vscode/), or the [CLI](/getting-started/cli/).
