# Atomize CLI Reference

Complete command-line interface documentation for Atomize v2.0.0.

## Table of Contents

- [Installation](#installation)
- [Global Options](#global-options)
- [Commands Overview](#commands-overview)
- [Command Reference](#command-reference)
  - [auth](#auth)
  - [generate](#generate)
  - [fields](#fields)
  - [validate](#validate)
  - [template create](#template-create)
  - [template list](#template-list)
  - [template install](#template-install)
  - [template remove](#template-remove)
  - [template resolve](#template-resolve)
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
| `fields` | - | Browse Azure DevOps work item fields |
| `fields list` | `fields ls` | List available fields for the current project or work item type |
| `validate` | - | Validate a template file |
| `template` | `tpl` | Template management commands |
| `template create` | - | Create a new template interactively or with AI |
| `template list` | `template ls` | List available templates and mixins from the catalog |
| `template install` | - | Install a template or mixin from a local file or HTTPS URL |
| `template remove` | `template rm` | Remove a user-installed template or mixin |
| `template resolve` | - | Resolve a composed template and print the merged result |
| `queries` | - | Browse Azure DevOps saved queries |
| `queries list` | `queries ls` | List saved queries with paths and IDs |

---

## Command Reference

### auth

Manage named connection profiles. Profiles store your credentials in the OS keychain when available. If the keychain is unavailable, `--insecure-storage` opts into an insecure local file fallback at `~/.atomize/`.

Two profile types are supported:
- **Azure DevOps** — for `generate`, `validate`, `fields list`, and `queries list`
- **GitHub Models (AI)** — for AI-assisted template generation (`template create --ai`)

#### auth add

Add a new connection profile.

```bash
atomize auth add [name] [options]
```

| Option | Description |
|--------|-------------|
| `--org-url <url>` | Organization URL (e.g. `https://dev.azure.com/myorg`) — Azure DevOps only |
| `--project <name>` | Project name — Azure DevOps only |
| `--team <name>` | Team name — Azure DevOps only |
| `--default` | Set this profile as the default for its platform |
| `--pat-stdin` | Read the PAT from stdin instead of `ATOMIZE_PAT` (preferred in CI) |
| `--insecure-storage` | Allow storing the token in an insecure local file fallback when the OS keychain is unavailable |

When run interactively, `auth add` first asks which platform to configure:

```
? Platform:
  ● Azure DevOps
  ○ GitHub Models (AI template generation)
```

**Adding an Azure DevOps profile:**
```bash
atomize auth add work-ado
# Prompts for org URL, project, team, and PAT
```

**Adding a GitHub Models (AI) profile:**
```bash
atomize auth add my-ai
# Prompts for a GitHub personal access token with Models access
```

**Non-interactive (Azure DevOps, CI/CD):**
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

  my-ai (GitHub Models (AI) · default)
    Token:    [keychain]
    Created:  1/3/2026, 10:05:00 AM
```

---

#### auth use

Set a profile as the default for its platform. Each platform (`azure-devops`, `github-models`) can have its own independent default.

```bash
atomize auth use [name]
```

```bash
atomize auth use work-ado   # sets default Azure DevOps profile
atomize auth use my-ai      # sets default GitHub Models (AI) profile
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

Test connectivity for a profile. Automatically detects whether the profile is an Azure DevOps or GitHub Models (AI) profile and runs the appropriate check.

- **Azure DevOps** — executes a WIQL query against your project to verify credentials and project access
- **GitHub Models (AI)** — calls the models listing endpoint to verify the token

```bash
atomize auth test [name]
```

```bash
atomize auth test work-ado   # test a specific profile
atomize auth test my-ai      # test an AI provider profile
atomize auth test            # pick interactively (shows profile type next to each name)
```

---

#### auth rotate

Replace the stored PAT for a profile (e.g. after a token expires).

```bash
atomize auth rotate [name]
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

**Dry run (default — no --execute):**
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

`excludeIfHasTasks` still applies — stories that already have tasks are skipped unless you remove that flag from the template.

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
| `--from-stories <ids>` | string | Learn template from multiple stories (comma-separated IDs) |
| `--scratch` | flag | Jump directly to the interactive wizard (skips mode selection) |
| `--ai` | flag | Use AI-assisted generation — describe the template in natural language |
| `--ground` | flag | Ground AI generation with patterns from your Azure DevOps workspace |
| `--ai-profile <name>` | string | AI provider profile to use (uses default GitHub Models profile if omitted) |
| `--save-as <name>` | string | Name to save the template under in the catalog |
| `--profile <name>` | string | Named ADO profile for `--from-stories` and field suggestions (uses default if omitted) |
| `-p, --platform <platform>` | string | Platform for `--from-stories` (default: `azure-devops`) |
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

# Ground with real patterns from your ADO workspace
atomize template create --ai --ground --profile work-ado

# Specify which AI profile to use
atomize template create --ai --ai-profile my-ai
```

Requires a GitHub Models profile (`atomize auth add` → select GitHub Models).

---

**3. Learn from Multiple Stories**

Analyze existing stories to detect patterns and build a higher-confidence template.

```bash
atomize template create --from-stories STORY-1,STORY-2,STORY-3

atomize template create \
  --from-stories STORY-123,STORY-456,STORY-789 \
  --save-as api-pattern
```

See [Story Learner](./Story-Learner.md) for details.

---

**4. Interactive Wizard (From Scratch)**

Step-by-step guided builder for full control.

```bash
atomize template create --scratch
```

The wizard walks through basic information, filter configuration, task configuration (including composition — inheritance and mixins), estimation settings, validation rules, and metadata.

---

#### Creating Mixins

A mixin is a reusable group of tasks that can be mixed into multiple templates via the `mixins:` field. Use `--type mixin` to create one.

```bash
atomize template create --type mixin
atomize template create --type mixin --save-as security-review-tasks
```

See [Template Reference — Composition](./Template-Reference.md#composition) for how to use mixins.

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

  backend-api
    Backend API Development
    Standard backend API development with database integration

  feature
    Feature Template
    Foundation for feature templates

  bug
    Bug Template
    Foundation for bug-fix templates

  custom
    Custom Example
    Example template with custom fields

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
| `--scope <scope>` | Installation scope: `user` (default, `~/.atomize`) or `project` (`.atomize` in current directory) |

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
- `user` (default) — installed to `~/.atomize/templates/`, available across all projects
- `project` — installed to `.atomize/templates/` in the current directory, scoped to this repo

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

### queries

Browse Azure DevOps saved queries — discover query paths and IDs without leaving the terminal.

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

Credentials are managed as named profiles. Each platform has its own independent default profile.

```bash
# Add an Azure DevOps profile
atomize auth add work-ado
atomize auth use work-ado   # set as default ADO profile

# Add a GitHub Models (AI) profile
atomize auth add my-ai
atomize auth use my-ai      # set as default AI profile

# Test both
atomize auth test work-ado
atomize auth test my-ai
```

### Environment Variables

**Authentication:**

```bash
export ATOMIZE_PAT="your-personal-access-token"          # Used by auth add
```

**Profile selection:**

```bash
export ATOMIZE_PROFILE="work-ado"       # Azure DevOps profile
export ATOMIZE_AI_PROFILE="my-ai"       # GitHub Models (AI) profile
```

Profile resolution order for ADO commands (`generate`, `fields list`, `queries list`, `validate --profile`):
1. `--profile <name>` flag
2. `ATOMIZE_PROFILE` environment variable
3. Default ADO profile (set via `atomize auth use`)

Profile resolution order for AI commands (`template create --ai`):
1. `--ai-profile <name>` flag
2. `ATOMIZE_AI_PROFILE` environment variable
3. Default GitHub Models profile (set via `atomize auth use`)

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
# 1. Add a GitHub Models profile
atomize auth add my-ai
atomize auth use my-ai

# 2. Describe your template to the AI
atomize template create --ai

# 3. Optionally ground it with real ADO patterns
atomize template create --ai --ground --profile work-ado
```

### Multi-Story Learning

```bash
atomize template create \
  --from-stories STORY-1,STORY-2,STORY-3,STORY-4,STORY-5 \
  --platform azure-devops
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

```bash
# Verify the AI profile is working
atomize auth test my-ai

# Make sure a GitHub Models profile exists
atomize auth list

# Specify it explicitly
atomize template create --ai --ai-profile my-ai
```

### Enable debug logging

```bash
export LOG_LEVEL="debug"
atomize generate template:backend-api --verbose
```

---

## See Also

- [Auth Guide](./Auth-Guide.md) - Credential storage, profile resolution, and CI/CD setup
- [Template Reference](./Template-Reference.md) - Complete template schema including composition
- [Validation Modes](./Validation-Modes.md) - Strict vs lenient validation explained
- [Common Validation Errors](./Common-Validation-Errors.md) - Fix specific validation errors
- [Platform Guide](./Platform-Guide.md) - Platform setup and configuration
- [Story Learner](./Story-Learner.md) - Generate templates from existing work items
- [Template Wizard Guide](./template-wizard-guide.md) - Interactive wizard walkthrough
- [Examples](../examples/) - Real-world template examples
