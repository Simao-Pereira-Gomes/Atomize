# Atomize CLI Reference

Complete command-line interface documentation for Atomize.

## Table of Contents

- [Installation](#installation)
- [Global Options](#global-options)
- [Commands Overview](#commands-overview)
- [Command Reference](#command-reference)
  - [auth](#auth)
  - [generate](#generate)
  - [preview](#preview)
  - [fields](#fields)
  - [validate](#validate)
  - [template create](#template-create)
  - [template improve](#template-improve)
  - [template list](#template-list)
  - [template install](#template-install)
  - [template remove](#template-remove)
  - [template resolve](#template-resolve)
  - [template metadata](#template-metadata)
  - [queries list](#queries-list)
- [Configuration](#configuration)
- [Interactive Prompts & Navigation](#interactive-prompts--navigation)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

---

## Installation

```bash
# Global installation (recommended)
npm install -g @sppg2001/atomize

# Verify installation
atomize --version

# Show help
atomize --help
```

**Aliases:** Both `atomize` and `atom` work as the CLI command.

---

## Global Options

These options work with any command:

| Option | Description |
|--------|-------------|
| `--version` | Print the installed version |
| `--help` | Show help for a command |
| `--env-file <path>` | Load environment variables from a file before running the command (shell environment takes precedence over file values) |

---

## Commands Overview

| Command | Alias | Description |
|---------|-------|-------------|
| `auth` | - | Manage named connection profiles |
| `auth add` | - | Add a new connection profile |
| `auth list` | `auth ls` | List all saved profiles |
| `auth use` | - | Set a profile as the default |
| `auth remove` | `auth rm` | Remove a profile |
| `auth test` | - | Test connectivity for a profile |
| `auth rotate` | - | Replace the PAT for a profile |
| `generate` | `gen` | Generate tasks from user stories using a template |
| `preview` | - | Inspect template field requirements or simulate task generation against mock story data |
| `fields` | - | Browse Azure DevOps work item fields |
| `fields list` | `fields ls` | List available fields for the current project or work item type |
| `validate` | - | Validate a template file |
| `template` | `tpl` | Template management commands |
| `template create` | - | Create a new template interactively or with AI |
| `template improve` | - | Propose an AI improvement to an existing template and review it before saving |
| `template list` | `template ls` | List available templates and mixins from the catalog |
| `template install` | - | Install a template or mixin from a local file or HTTPS URL |
| `template remove` | `template rm` | Remove a user-installed template or mixin |
| `template resolve` | - | Resolve a composed template and print the merged result |
| `template metadata` | - | Read Azure DevOps project metadata as JSON, for visual template authoring surfaces |
| `queries` | - | Browse Azure DevOps saved queries |
| `queries list` | `queries ls` | List saved queries with paths and IDs |

---

## Command Reference

### auth

Manage named connection profiles. Profiles store your credentials in the OS keychain when available. If the keychain is unavailable, `--insecure-storage` opts into an insecure local file fallback at `~/.atomize/`.

Azure DevOps is currently the only Connection Profile type: for `generate`, `validate`, `fields list`, `queries list`, and `template metadata`. AI-assisted template generation (`template create --ai`) does not use a Connection Profile; it authenticates through a separate Copilot Session (see [Auth Guide - AI Drafting: Copilot Session](./Auth-Guide.md#ai-drafting-copilot-session)). GitHub Models profiles are retired: see [Auth Guide - GitHub Models Retirement](./Auth-Guide.md#github-models-retirement).

#### auth add

Add a new Azure DevOps connection profile.

```bash
atomize auth add [name] [options]
```

| Option | Description |
|--------|-------------|
| `--org-url <url>` | Organization URL (e.g. `https://dev.azure.com/myorg`) |
| `--project <name>` | Project name |
| `--team <name>` | Team name |
| `--default` | Set this profile as the default |
| `--pat-stdin` | Read the PAT from stdin instead of `ATOMIZE_PAT` (preferred in CI) |
| `--insecure-storage` | Allow storing the token in an insecure local file fallback when the OS keychain is unavailable |

```bash
atomize auth add work-ado
# Prompts for org URL, project, team, and PAT
```

**Non-interactive (CI/CD):**
```bash
echo "$AZURE_DEVOPS_PAT" | atomize auth add work-ado \
  --org-url https://dev.azure.com/myorg \
  --project MyProject \
  --team MyTeam \
  --default \
  --pat-stdin
```

Profile names may contain letters, numbers, hyphens, and underscores.

---

#### auth list

List all saved connection profiles.

```bash
atomize auth list
atomize auth ls   # alias
```

**Output:**
```
  work-ado (Azure DevOps · default)
    URL:      https://dev.azure.com/myorg
    Project:  MyProject
    Team:     MyTeam
    Token:    [keychain]
    Created:  1/3/2026, 10:00:00 AM
```

A retired `github-models` profile, if one still exists from before the retirement, is listed too: only so you can remove it with `auth remove`; it can no longer be used for anything.

---

#### auth use

Set a profile as the default Azure DevOps profile.

```bash
atomize auth use [name]
```

```bash
atomize auth use work-ado   # sets default profile
atomize auth use            # pick interactively
```

---

#### auth remove

Remove a saved connection profile.

```bash
atomize auth remove [name]
atomize auth rm [name]   # alias
```

---

#### auth test

Test connectivity for a profile by executing a WIQL query against your project to verify credentials and project access. Testing a retired `github-models` profile fails with a message pointing you to remove it.

```bash
atomize auth test [name]
```

```bash
atomize auth test work-ado   # test a specific profile
atomize auth test            # pick interactively
```

---

#### auth rotate

Replace the stored PAT for a profile (e.g. after a token expires). Refuses a retired `github-models` profile and points you to `auth remove` instead.

```bash
atomize auth rotate <name> [options]
```

| Option | Description |
|--------|-------------|
| `--pat-stdin` | Read the new PAT from stdin instead of prompting interactively |
| `--insecure-storage` | Allow insecure local file fallback when the OS keychain is unavailable |

```bash
echo "$NEW_PAT" | atomize auth rotate work-ado --pat-stdin
```

---

### generate

Generate tasks from user stories using a template. By default runs as a dry run (preview only). Use `--execute` to actually create tasks.

#### Usage

```bash
atomize generate [template] [options]
atomize gen [template] [options]  # alias
```

#### Arguments

| Argument | Description |
|----------|-------------|
| `[template]` | Path to a YAML template file or catalog ref (e.g. `template:backend-api`). If omitted, you will be prompted. |

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `-p, --platform <platform>` | string | `azure-devops` | Platform to use. Options: `azure-devops`, `mock` |
| `--profile <name>` | string | - | Named connection profile to use (see `auth add`) |
| `--execute` | flag | - | Actually create tasks (default is dry-run preview) |
| `--auto-approve` | flag | - | Required with `--execute` in non-interactive mode to acknowledge live task creation |
| `--continue-on-error` | flag | - | Keep processing other stories if one fails |
| `--story <ids...>` | string[] | - | Target specific work items by ID, bypassing the template filter. `excludeIfHasTasks` still applies. |
| `--story-concurrency <n>` | number | `3` | Max stories processed in parallel (max: 10) |
| `--task-concurrency <n>` | number | `5` | Max tasks created in parallel per story (max: 20) |
| `--dependency-concurrency <n>` | number | `5` | Max dependency links created in parallel (max: 10) |
| `--limit <n>` | number | - | Cap the number of work items processed (useful for testing before a full `--execute` run) |
| `-v, --verbose` | flag | - | Show detailed output including per-task breakdown |
| `-o, --output <file>` | string | - | Write a JSON report to this file path (for CI/CD) |
| `--include-sensitive-report-data` | flag | - | Include descriptions, custom fields, and platform-specific work item data in the JSON report (`--output` only) |
| `-q, --quiet` | flag | - | Suppress non-essential output |

#### Examples

**Dry run (default: no --execute):**
```bash
atomize generate template:backend-api
```

**Execute for real:**
```bash
atomize generate template:backend-api --execute
```

**Target specific stories by ID (bypasses filter):**
```bash
atomize generate template:backend-api --story STORY-123 STORY-456
```

Use `--story` to skip the template's `filter` criteria and process explicit work items directly. Useful for:
- Re-running a generation that failed partway through
- Processing a one-off story that does not match the template's usual filter
- Testing the template against a known story before a full run

`excludeIfHasTasks` still applies: stories that already have tasks are skipped unless you remove that flag from the template.

**Execute for real in CI/non-interactive mode:**
```bash
atomize generate template:backend-api --execute --auto-approve
```

**Mock platform (no credentials needed):**
```bash
atomize generate template:backend-api --platform mock
```

**Test against a subset of items before a full run:**
```bash
atomize generate template:backend-api --limit 5
```

**CI/CD with JSON report:**
```bash
atomize generate template:backend-api \
  --execute \
  --output report.json \
  --quiet
```

By default the JSON report omits story descriptions, custom field values, and raw platform payloads to avoid accidentally writing sensitive data to disk or log collectors. Pass `--include-sensitive-report-data` to include them:

```bash
atomize generate template:backend-api \
  --execute \
  --output report.json \
  --include-sensitive-report-data
```

When to use `--include-sensitive-report-data`:
- Debugging unexpected task output (custom field values, description interpolation)
- Auditing exactly what was sent to the platform
- Internal tooling that processes the full report programmatically

Do not use it in shared CI pipelines where the report artifact may be visible to other users.

#### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All stories processed successfully |
| `1` | One or more stories failed |

---

### preview

Inspect template field requirements or simulate task generation against a mock story. This command does not connect to Azure DevOps and does not create tasks.

#### Usage

```bash
atomize preview <source> --inspect
atomize preview <source> --mock-story '{"id":"123","title":"Example story","estimation":8}'
```

#### Arguments

| Argument | Description |
|----------|-------------|
| `<source>` | Path to a YAML template file, catalog ref, or HTTPS URL |

#### Options

| Option | Description |
|--------|-------------|
| `--inspect` | Output JSON describing which story fields the template references |
| `--mock-story <json>` | JSON object of mock story field values to preview against |

`--inspect` and `--mock-story` are mutually exclusive. One of them is required.

#### Examples

```bash
atomize preview template:backend-api --inspect

atomize preview template:backend-api \
  --mock-story '{"id":"123","title":"Add password reset","estimation":8,"tags":["backend"]}'
```

---

### validate

Validate a template file for correctness and completeness.

#### Usage

```bash
atomize validate <template> [options]
```

#### Arguments

| Argument | Description |
|----------|-------------|
| `<template>` | Path to a YAML template file or HTTPS URL. **Required.** |

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `-s, --strict` | flag | - | Use strict mode: warnings are treated as errors |
| `-q, --quiet` | flag | - | Suppress non-essential output |
| `--profile <name>` | string | - | Connect to ADO using a named profile for live saved-query and custom-field validation |

> See [Validation Modes](./Validation-Modes.md) for a full explanation of strict vs lenient behavior.

**Validation modes for ADO-backed features:**
- Without `--profile`, validation runs offline and checks template structure only
- With `--profile`, Atomize connects to ADO to validate task `customFields`, custom fields referenced in task conditions, and `filter.savedQuery`
- In interactive terminals, if ADO-backed validation is needed, Atomize can prompt you to choose offline vs online validation
- In `--strict` mode, offline custom-field verification warnings are promoted to errors

#### Examples

```bash
atomize validate template:backend-api
atomize validate template:backend-api --strict
atomize validate template:backend-api --profile work-ado
atomize validate https://example.com/templates/shared.yaml
```

#### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Template is valid |
| `1` | Template validation failed |

---

### fields

Browse Azure DevOps work item fields available to the current profile.

#### fields list

```bash
atomize fields list [options]
atomize fields ls   # alias
```

| Option | Description |
|--------|-------------|
| `--type <WorkItemType>` | Scope results to a specific work item type such as `Task` or `Bug` |
| `--custom-only` | Show only custom fields (`Custom.*`) |
| `--profile <name>` | Named connection profile to use (uses default if omitted) |
| `--json` | Print results as JSON to stdout; progress messages go to stderr |

**Examples:**

```bash
atomize fields list
atomize fields list --type Task
atomize fields list --type Task --custom-only
atomize fields list --type Task --json > task-fields.json
```

---

### template create

Create a new template or mixin using one of several methods.

#### Usage

```bash
atomize template create [options]
atomize tpl create [options]  # alias
```

#### Options

| Option | Type | Description |
|--------|------|-------------|
| `--type <type>` | string | Create a `template` or a `mixin` (prompted if omitted) |
| `--from <name>` | string | Start from an existing catalog template |
| `--scratch` | flag | Jump directly to the interactive wizard (skips mode selection) |
| `--ai` | flag | Use AI-assisted generation: describe the template in natural language |
| `--ground` | flag | Ground AI generation in your Azure DevOps project's work item types, states, fields and allowed values, saved queries, and area and iteration paths. Uses `--profile`, or the default profile |
| `--reference <path>` | string | With `--ai`, send a [Reference Document](./Template-Creation.md#reference-documents): a Markdown or text file in the workspace, or `wiki:<wiki>/<page path>` for an Azure DevOps wiki page read through `--profile`. Repeatable |
| `--no-project-references` | flag | With `--ai`, leave out the Project Reference Documents saved in `.atomize/ai.yaml` |
| `--save-as <name>` | string | Name to save the template under in the catalog |
| `--scope <scope>` | string | Catalog to save to: `user` (`~/.atomize/catalog`) or `project` (`.atomize/catalog` in the project root). Default: `project` when the project root has its own `.atomize` folder, otherwise `user`. |
| `--open` | flag | Open the saved Atomize YAML file in a supported editor after successful creation |
| `--profile <name>` | string | Named ADO profile for `--ground` and field suggestions (uses default if omitted) |
| `-q, --quiet` | flag | Suppress non-essential output |

#### Creation Modes

**1. From Catalog Template**

Start from a built-in or previously installed template.

```bash
atomize template create --from backend-api
atomize template create --from my-custom-template
```

Use `atomize template list` to see available names.

---

**2. AI-Assisted Generation**

Describe the template you need in plain language and let AI generate it.

```bash
# Basic AI generation
atomize template create --ai

# Ground the draft in your project's real types, fields, and saved queries
atomize template create --ai --ground --profile work-ado

# Also follow the process your team wrote down
atomize template create --ai --ground --reference docs/how-we-work.md --profile work-ado

```

Requires an active GitHub Copilot subscription. Atomize starts the bundled Copilot sign-in flow when needed.

---

**3. Interactive Wizard (From Scratch)**

Step-by-step guided builder for full control.

```bash
atomize template create --scratch
```

The wizard walks through basic information, filter configuration, task configuration (including composition: inheritance and mixins), estimation settings, validation rules, and metadata.

---

#### Creating Mixins

A mixin is a reusable group of tasks that can be mixed into multiple templates via the `mixins:` field. Use `--type mixin` to create one.

```bash
atomize template create --type mixin
atomize template create --type mixin --save-as security-review-tasks
```

See [Template Reference: Composition](./Template-Reference.md#composition) for how to use mixins.

---

### template improve

Asks Copilot to propose a revision of an existing Template, then shows you the changes before anything is saved.

```bash
atomize template improve <template> [options]
```

`<template>` is a Catalog ref (`template:<name>`) or a path to a Template file. Remote Templates must be downloaded first.

**Options:**

| Option | Type | Description |
|--------|------|-------------|
| `--guidance <text>` | string | What the improvement should focus on, such as "tighten the estimates" or "add security reviews". Interactive runs ask for it when you leave it out; press Enter for a general review |
| `--ground` | flag | Ground the improvement in your Azure DevOps project's work item types, fields and allowed values, saved queries, and paths |
| `--profile <name>` | string | Connection Profile used for grounding (the default profile if omitted) |
| `--reference <path>` | string | Send a [Reference Document](./Template-Creation.md#reference-documents): a Markdown or text file in the workspace, or `wiki:<wiki>/<page path>` for an Azure DevOps wiki page read through `--profile`. Repeatable |
| `--no-project-references` | flag | Leave out the Project Reference Documents saved in `.atomize/ai.yaml` |
| `--save-as <name>` | string | Save the improvement as a new Template, leaving the source untouched |
| `--scope <scope>` | string | With `--save-as`, the Catalog to save to: `user` or `project`. Default: `project` when the project root has its own `.atomize` folder, otherwise `user`. |
| `--overwrite` | flag | Replace the source Template with the improvement without asking |
| `--dry-run` | flag | Show the proposed changes without saving anything |
| `--strict` | flag | Treat validation warnings as errors |
| `--output <file>` | string | Write a JSON report of the proposal |
| `-q, --quiet` | flag | Suppress non-essential output |

**What Copilot can change.** Copilot looks for clearer Task titles and descriptions, estimation percentages that fit the work, missing test, review or documentation Tasks, and useful conditions, filters, custom fields and dependencies. It works through the same tool-free Copilot Session as `template create --ai` (see [Auth Guide - AI Drafting: Copilot Session](./Auth-Guide.md#ai-drafting-copilot-session)).

**Grounding.** Without grounding, Copilot reviews the Template on its own. With `--ground`, it also gets your project's work item types, states, field reference names and allowed values, saved queries, and area and iteration paths, and uses only these names when it proposes conditions, custom fields or queries. In an interactive run without `--ground`, Atomize asks whether to ground the improvement. The profile's token is used only to read from Azure DevOps and is never sent to Copilot. To tell Copilot where the Template doesn't fit how your team works, say so in `--guidance` (for example "we always end up adding a security review") or give it your written process as a [Reference Document](./Template-Creation.md#reference-documents).

If grounding you asked for can't be loaded (for example, the token has expired), an interactive run lets you retry, continue without grounding, or cancel. A non-interactive run stops with an error rather than improving without it.

**Inherited Templates stay intact.** For a Template that uses `extends` or Mixins, Copilot sees the composed Template so it doesn't suggest Tasks the parent already has. The proposal never changes `extends`, `mixins` or `origin`, and never copies inherited Tasks into the Template. Where an inherited Task deserves a change, Copilot says so in its notes instead, so you can change the parent or Mixin yourself. The proposal is validated composed with its parent, exactly as it will run.

**Reviewing and saving.** You see the proposed changes (Template fields, and Tasks added, removed, changed or moved) and Copilot's notes. Nothing is saved without your say-so:

- In an interactive run, choose **Save changes to the source Template**, **Save as a new Template**, **View the full YAML**, or **Reject**.
- `--overwrite` saves over the source. Your comments, key order and formatting are kept wherever the content didn't change.
- `--save-as <name>` saves a new Template named "*Name* (improved)". When the source is a Catalog Template, the new one records it as its `origin`, so `template list` shows where it came from. It refuses to replace an existing Template.
- A non-interactive run without `--overwrite` or `--save-as` saves nothing.
- Built-in Templates can only be saved with `--save-as`.

If the proposal still fails validation after Copilot's repair attempts (or has warnings with `--strict`), nothing is saved. An interactive run lets you retry, save the proposal as a draft file beside the source to fix by hand, or reject it. A non-interactive run exits with code 1.

**JSON report (`--output`):**

| Field | Description |
|-------|-------------|
| `template` | The Catalog ref or file that was improved |
| `ok` | Whether the proposal passed validation |
| `diff` | The proposed changes: `fieldChanges`, `taskChanges`, and `identical` |
| `validation` | `valid`, `errors`, and `warnings` |
| `notes` | Copilot's notes on what it changed and why |
| `guidance` | The guidance used, or `null` |
| `referenceDocuments` | Each Reference Document sent (`ref`, `title`), and whether it was shortened to fit (`truncated`, `originalLength`, `sentLength`) |
| `saved` | What was saved (`overwrite`, `save-as`, or `draft`) and where, or `null` |

**Examples:**

```bash
# Review an improvement, then choose what to do
atomize template improve template:backend-api

# Focus the improvement, and save it as a new Template
atomize template improve template:backend-api --guidance "add security reviews" --save-as backend-api-secure

# Ground the improvement in your project and your written process
atomize template improve template:backend-api --ground --reference docs/how-we-work.md --profile work-ado

# Gate an improvement in CI without saving
atomize template improve ./templates/backend.atomize.yaml --dry-run --strict --output improve-report.json
```

---

### template list

List available templates and mixins from the catalog (built-in and user-installed).

#### Usage

```bash
atomize template list [options]
atomize template ls   # alias
atomize tpl ls        # alias
```

#### Options

| Option | Description |
|--------|-------------|
| `--type <type>` | Filter by type: `template` or `mixin` |

#### Output

```
Built-in Templates

  agile-story-breakdown
    Agile Story Breakdown
    Agile story breakdown template

  agile-story-breakdown-saved-query
    Agile Story Breakdown - Saved Query
    Agile story breakdown template driven by a saved query

  backend-api
    Backend API Development
    Standard backend API development with database integration

  bug-fix
    Bug Fix
    Foundation for bug-fix templates

  feature-development
    Feature Development
    Foundation for feature development templates

User Templates

  my-api-template
    My API Template
    (no description)

Use with: atomize generate template:<name>
         atomize template create --from <name>
```

---

### template install

Install a template or mixin from a local file or HTTPS URL into the catalog.

#### Usage

```bash
atomize template install <source> [options]
atomize tpl install <source> [options]  # alias
```

#### Arguments

| Argument | Description |
|----------|-------------|
| `<source>` | Path to a local YAML file or an HTTPS URL |

#### Options

| Option | Description |
|--------|-------------|
| `--type <type>` | Force type: `template` or `mixin` (auto-detected from file content if omitted) |
| `--overwrite` | Overwrite if a template with the same name already exists |
| `--scope <scope>` | Installation scope: `user` (`~/.atomize/catalog`) or `project` (`.atomize/catalog` in the project root: the nearest folder with a `.atomize` folder, otherwise the git repo root, otherwise the current directory). Without `--scope`, it's `project` when the project root has its own `.atomize` folder, meaning the team has opted in, and `user` otherwise. |
| `--open` | Open the installed Atomize YAML file in a supported editor after successful installation |
| `-q, --quiet` | Suppress non-essential output |

#### Examples

```bash
# Install from a local file
atomize template install ./templates/my-api.yaml

# Install from a URL (shared team template)
atomize template install https://example.com/templates/security-review.yaml

# Install as project-scoped (stored in .atomize/ next to your code)
atomize template install ./templates/sprint-tasks.yaml --scope project

# Overwrite an existing template
atomize template install ./templates/backend-api.yaml --overwrite
```

**Scopes:**
- `user` (default): installed to `~/.atomize/catalog/`, available across all projects
- `project`: installed to `<workspace>/.atomize/catalog/`, scoped to the discovered workspace root

**Editor handoff:**

Pass `--open` to `template create` or `template install` to open the saved Atomize YAML file after success. `ATOMIZE_EDITOR` accepts supported editor identifiers only: `code`, `cursor`, or `zed`. Atomize appends the saved file path to its owned editor command and ignores arbitrary `VISUAL` and `EDITOR` command strings for this handoff. If no supported editor CLI is available, use the printed manual hint.

---

### template remove

Remove a user-installed template or mixin from the catalog. Built-in templates cannot be removed.

#### Usage

```bash
atomize template remove <name> [options]
atomize template rm <name> [options]   # alias
```

#### Arguments

| Argument | Description |
|----------|-------------|
| `<name>` | Template ref (`template:<name>` or `mixin:<name>`) or bare name |

#### Options

| Option | Description |
|--------|-------------|
| `--type <type>` | Restrict to a specific type: `template` or `mixin` |
| `-f, --force` | Skip confirmation prompt |

#### Examples

```bash
atomize template remove my-api-template
atomize template remove mixin:security-tasks
atomize template remove my-api-template --force
```

---

### template resolve

Resolve a composed template (one that uses `extends` or `mixins`) and print the fully merged YAML. Useful for debugging composition and verifying the final template before use.

#### Usage

```bash
atomize template resolve <template> [options]
```

#### Arguments

| Argument | Description |
|----------|-------------|
| `<template>` | Template ref (`template:<name>`) or path to a YAML file |

#### Options

| Option | Description |
|--------|-------------|
| `--validate` | Also run schema validation on the resolved template |
| `-q, --quiet` | Print only the resolved YAML, no decorative output |

#### Examples

```bash
# Resolve and preview a composed template
atomize template resolve template:my-api

# Resolve from a file
atomize template resolve ./templates/composed.yaml

# Resolve, validate, and pipe to a file
atomize template resolve template:my-api --quiet > resolved.yaml

# Resolve and validate in one step
atomize template resolve template:my-api --validate
```

---

### template metadata

Read Azure DevOps project metadata as a single JSON document: work item types, states, area paths, iteration paths, teams, saved queries, and task field schemas. This is the same data source that grounds visual template-authoring surfaces such as Atomize Studio's [Grounded Field Options](./Atomize-Studio.md), but it is a normal CLI command: any user or script can call it directly for the same JSON, for example to build custom tooling around a project's Azure DevOps schema.

#### Usage

```bash
atomize template metadata [options]
atomize tpl metadata [options]  # alias
```

#### Options

| Option | Description |
|--------|-------------|
| `--profile <name>` | Named Azure DevOps connection profile (uses the default if omitted) |
| `--json` | Suppress non-JSON status output, for piping to another tool |

The command always prints indented JSON to stdout, whether or not `--json` is passed; `--json` only silences surrounding log/status output, matching the convention used by `fields list --json` and `queries list --json`.

#### Output

A single JSON object:

```json
{
  "workItemTypes": ["User Story", "Bug", "Task"],
  "statesByWorkItemType": {
    "User Story": ["New", "Active", "Resolved", "Closed"],
    "Bug": ["New", "Active", "Resolved", "Closed"]
  },
  "areaPaths": ["MyProject", "MyProject\\Backend"],
  "iterationPaths": ["MyProject\\Sprint 1", "MyProject\\Sprint 2"],
  "teams": ["Backend Team", "Frontend Team"],
  "savedQueries": [{ "id": "...", "path": "Shared Queries/Teams/Backend/Active Bugs" }],
  "taskFields": [],
  "fieldsByWorkItemType": {}
}
```

`taskFields` holds the field schema for the `Task` work item type; `fieldsByWorkItemType` holds field schemas keyed by every work item type returned in `workItemTypes`. Both use Azure DevOps's field-schema shape (reference name, type, allowed values).

#### Examples

```bash
atomize template metadata --profile work-ado

atomize template metadata --profile work-ado --json > project-metadata.json
```

Requires a Connection Profile (see [Auth Guide](./Auth-Guide.md)): there is no offline mode, since the output is Azure DevOps project data.

---

### queries

Browse Azure DevOps saved queries: discover query paths and IDs without leaving the terminal.

#### queries list

```bash
atomize queries list [options]
atomize queries ls   # alias
```

| Option | Description |
|--------|-------------|
| `--folder <path>` | Scope results to queries under this folder path prefix |
| `--profile <name>` | Named connection profile to use (uses default if omitted) |
| `--json` | Print results as JSON to stdout; progress messages go to stderr |

**Examples:**

```bash
atomize queries list
atomize queries list --folder "Shared Queries/Teams/Backend"
atomize queries list --json | jq '.[] | select(.isPublic) | .path'
```

---

## Configuration

### Connection Profiles

Credentials are managed as named Azure DevOps profiles, with one independent default.

```bash
atomize auth add work-ado
atomize auth use work-ado   # set as default profile
atomize auth test work-ado
```

AI-assisted template drafting (`template create --ai`) talks to Copilot without a Connection Profile: see [Auth Guide - AI Drafting: Copilot Session](./Auth-Guide.md#ai-drafting-copilot-session). Only `--ground` uses a Connection Profile, to read your project's metadata; the profile's token is never sent to Copilot.

### Environment Variables

**Authentication:**

```bash
export ATOMIZE_PAT="your-personal-access-token"          # Used by auth add
```

**Profile selection:**

```bash
export ATOMIZE_PROFILE="work-ado"       # Azure DevOps profile
```

Profile resolution order for ADO commands (`generate`, `fields list`, `queries list`, `validate --profile`, `template metadata`):
1. `--profile <name>` flag
2. `ATOMIZE_PROFILE` environment variable
3. Default profile (set via `atomize auth use`)

**Logging:**

```bash
export LOG_LEVEL="info"   # debug, info, warn, error
```

### .env File

No `.env` file is loaded automatically. Use the global `--env-file` flag to load one explicitly:

```bash
atomize --env-file .env.work generate template:backend-api
atomize --env-file /etc/atomize/ci.env generate template:backend-api --execute --auto-approve
```

Shell environment variables always take precedence over values in the file.

Example `.env` file:

```bash
ATOMIZE_PROFILE=work-ado
```

---

## Interactive Prompts & Navigation

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate between options in a list |
| `Enter` | Confirm selection or submit input |
| `Space` | Toggle selection (in multi-select prompts) |
| `Ctrl+C` | Cancel the current operation and exit |

---

## Examples

### Complete Workflow: Azure DevOps

```bash
# 1. Save your Azure DevOps credentials
atomize auth add work-ado
atomize auth use work-ado

# 2. Verify the connection
atomize auth test work-ado

# 3. Browse available templates
atomize template list

# 4. Start from a catalog template
atomize template create --from backend-api --save-as my-backend

# 5. Validate it
atomize validate my-backend.yaml

# 6. Preview (dry run)
atomize generate my-backend.yaml

# 7. Execute
atomize generate my-backend.yaml --execute
```

### AI-Assisted Template Creation

```bash
# 1. Describe your template to the AI (signs in to GitHub Copilot when needed)
atomize template create --ai

# 2. Optionally ground it in your project's real types, fields, and saved queries
atomize template create --ai --ground --profile work-ado
```

### Using Composed Templates

```bash
# Install a shared mixin from a URL
atomize template install https://example.com/mixins/security-review.yaml

# Resolve and inspect a composed template
atomize template resolve template:my-api

# Validate a composed template
atomize template resolve template:my-api --validate
```

### Target Specific Stories

```bash
# Run only against specific story IDs (bypasses filter)
atomize generate template:backend-api --story STORY-101 STORY-102 STORY-103
```

### CI/CD Integration

```yaml
# .github/workflows/generate-tasks.yml
jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Atomize
        run: npm install -g @sppg2001/atomize

      - name: Save connection profile
        run: |
          echo "${{ secrets.AZURE_DEVOPS_PAT }}" | atomize auth add ci \
            --org-url "${{ secrets.AZURE_DEVOPS_ORG_URL }}" \
            --project "${{ secrets.AZURE_DEVOPS_PROJECT }}" \
            --team "${{ secrets.AZURE_DEVOPS_TEAM }}" \
            --default \
            --pat-stdin \
            --insecure-storage

      - name: Validate Templates
        run: |
          for template in templates/*.yaml; do
            atomize validate "$template" --strict --quiet
          done

      - name: Generate Tasks
        run: |
          atomize generate template:backend-api \
            --execute \
            --auto-approve \
            --output task-report.json \
            --continue-on-error
```

---

## Troubleshooting

### "Not authenticated" error

```bash
atomize auth list
atomize auth add work-ado
atomize auth test work-ado
atomize auth use work-ado
```

### "Template validation failed"

```bash
atomize validate template:my-template --strict
```

### "No matching stories found"

```bash
# Test with mock platform first
atomize generate templates/my-template.yaml --platform mock
```

### AI template generation fails

AI drafting authenticates through GitHub Copilot, not a Connection Profile: see [Auth Guide - AI Drafting: Copilot Session](./Auth-Guide.md#ai-drafting-copilot-session).

```bash
# Non-interactive runs need Copilot already signed in on that machine:
# sign in once interactively, then retry:
atomize template create --ai
```

### Enable debug logging

```bash
export LOG_LEVEL="debug"
atomize generate template:backend-api --verbose
```

---

## See Also

- [Auth Guide](./Auth-Guide.md) - Credential storage, profile resolution, and CI/CD setup
- [Schema Reference](https://atomize-cd9.pages.dev/schema) - YAML fields, defaults and constraints
- [Template Reference](./Template-Reference.md) - Behaviour and composition
- [Validation Modes](./Validation-Modes.md) - Strict vs lenient validation explained
- [Common Validation Errors](./Common-Validation-Errors.md) - Fix specific validation errors
- [Platform Guide](./Platform-Guide.md) - Platform setup and configuration
- [Template Creation](./Template-Creation.md) - Catalog, wizard, AI-assisted, and mixin workflows
- [Examples](../examples/) - Real-world template examples
