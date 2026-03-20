# Atomize CLI Reference

Complete command-line interface documentation for Atomize v1.1.

## Table of Contents

- [Installation](#installation)
- [Global Options](#global-options)
- [Commands Overview](#commands-overview)
- [Command Reference](#command-reference)
  - [auth](#auth)
  - [generate](#generate)
  - [validate](#validate)
  - [template create](#template-create)
  - [template presets](#template-presets)
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
| `validate` | - | Validate a template file |
| `template` | `tpl` | Template management commands |
| `template create` | - | Create a new template interactively |
| `template presets` | `ls` | List available template presets |

---

## Command Reference

### auth

Manage named connection profiles for Azure DevOps. Profiles store your organization URL, project, team, and PAT in the OS keychain when available. If the keychain is unavailable, `--insecure-storage` opts into an insecure local file fallback at `~/.atomize/`.

#### auth add

Add a new connection profile.

```bash
atomize auth add [name] [options]
```

| Option | Description |
|--------|-------------|
| `--org-url <url>` | Organization URL (e.g. `https://dev.azure.com/myorg`) |
| `--project <name>` | Project name |
| `--team <name>` | Team name |
| `--default` | Set this profile as the default |
| `--pat-stdin` | Read the PAT from stdin instead of `ATOMIZE_PAT` (preferred in CI — avoids token exposure in environment variables, process listings, and CI logs) |
| `--insecure-storage` | Allow storing the token in an insecure local file fallback when the OS keychain is unavailable. The token data is encrypted, but the key is stored in the same directory, so anyone who can read `~/.atomize/` can recover it. Treat this as compatibility fallback storage, not secure secret storage. |

In non-interactive mode the PAT must be supplied via `ATOMIZE_PAT` or `--pat-stdin`.

**Interactive (recommended for first-time setup):**
```bash
atomize auth add work-ado
# Prompts for org URL, project, team, and PAT
```

**Non-interactive with `--pat-stdin` (recommended for CI/CD):**
```bash
# Pipe the token — never appears in env or shell history
echo "$AZURE_DEVOPS_PAT" | atomize auth add work-ado \
  --org-url https://dev.azure.com/myorg \
  --project MyProject \
  --team MyTeam \
  --default \
  --pat-stdin
```

**Non-interactive with `ATOMIZE_PAT` (simpler, but token visible in env):**
```bash
# macOS / Linux
ATOMIZE_PAT=YOUR_PAT atomize auth add work-ado \
  --org-url https://dev.azure.com/myorg \
  --project MyProject \
  --team MyTeam \
  --default
```
```powershell
# Windows (PowerShell)
$env:ATOMIZE_PAT = "YOUR_PAT"
atomize auth add work-ado `
  --org-url https://dev.azure.com/myorg `
  --project MyProject `
  --team MyTeam `
  --default
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
  work-ado (default)
    Platform: azure-devops
    URL:      https://dev.azure.com/myorg
    Project:  MyProject
    Team:     MyTeam
    Token:    [keychain]
    Created:  1/3/2026, 10:00:00 AM
```

---

#### auth use

Set a profile as the default. The default profile is used automatically by `generate` when `--profile` is not specified.

```bash
atomize auth use [name]
```

```bash
atomize auth use work-ado
# or omit the name to pick interactively
atomize auth use
```

---

#### auth remove

Remove a saved connection profile.

```bash
atomize auth remove [name]
atomize auth rm [name]   # alias
```

```bash
atomize auth remove old-profile
# or omit the name to pick interactively
atomize auth remove
```

---

#### auth test

Test connectivity for a profile by making a live request to the platform.

```bash
atomize auth test [name]
```

```bash
atomize auth test work-ado
# or omit the name to test the default profile
atomize auth test
```

---

#### auth rotate

Replace the stored PAT for a profile (e.g. after a token expires).

```bash
atomize auth rotate [name]
```

```bash
atomize auth rotate work-ado
# or omit the name to pick interactively
atomize auth rotate
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
| `[template]` | Path to a YAML template file. If omitted, you will be prompted. |

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `-p, --platform <platform>` | string | `azure-devops` | Platform to use. Options: `azure-devops`, `mock` |
| `--profile <name>` | string | - | Named connection profile to use (see `auth add`) |
| `--execute` | flag | - | Actually create tasks (default is dry-run preview) |
| `--auto-approve` | flag | - | Required with `--execute` in non-interactive mode to acknowledge live task creation |
| `--continue-on-error` | flag | - | Keep processing other stories if one fails |
| `--story-concurrency <n>` | number | `3` | Max stories processed in parallel (max: 10) |
| `--task-concurrency <n>` | number | `5` | Max tasks created in parallel per story (max: 20) |
| `--dependency-concurrency <n>` | number | `5` | Max dependency links created in parallel (max: 10) |
| `-v, --verbose` | flag | - | Show detailed output including per-task breakdown |
| `-o, --output <file>` | string | - | Write a JSON report to this file path (for CI/CD) |
| `-q, --quiet` | flag | - | Suppress non-essential output |

#### Examples

**Interactive mode (no template specified):**
```bash
atomize generate
# Prompts for: template file, platform (dry-run by default)
```

**Dry run (default — no --execute):**
```bash
atomize generate templates/backend-api.yaml
```

**Execute for real:**
```bash
atomize generate templates/backend-api.yaml --execute
```

**Execute for real in CI/non-interactive mode:**
```bash
atomize generate templates/backend-api.yaml --execute --auto-approve
```

**Mock platform (no credentials needed):**
```bash
atomize generate templates/backend-api.yaml --platform mock
```

**Verbose output:**
```bash
atomize generate templates/backend-api.yaml --execute --verbose
```

**Continue on error:**
```bash
atomize generate templates/backend-api.yaml --execute --continue-on-error
```

**Increase concurrency for large backlogs:**
```bash
atomize generate templates/backend-api.yaml \
  --execute \
  --story-concurrency 8 \
  --task-concurrency 10
```

**CI/CD with JSON report:**
```bash
atomize generate templates/backend-api.yaml \
  --execute \
  --output report.json \
  --quiet
```

#### Output

```
========================================================================
  ATOMIZATION RESULTS
========================================================================

 Summary:
  Template:          Backend API Development
  Stories processed: 3
  Stories success:   3
  Stories failed:    0
  Tasks calculated:  18
  Tasks created:     18
  Execution time:    2547ms

 Details:

✓ STORY-001: Implement user authentication API
  Estimation: 8 points
  Tasks: 6
  Distribution: 8 points (100%)

✓ STORY-003: Implement payment processing
  Estimation: 13 points
  Tasks: 6
  Distribution: 13 points (100%)

SUCCESS - Created 18 tasks for 3 stories
```

> Details are shown when `--verbose` is set or there are 5 or fewer stories processed.

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
| `<template>` | Path to a YAML template file. **Required.** |

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `-v, --verbose` | flag | - | Show detailed validation information including all checked rules |
| `-s, --strict` | flag | - | Use strict mode: warnings are treated as errors |
| `-q, --quiet` | flag | - | Suppress non-essential output |

> See [Validation Modes](./Validation-Modes.md) for a full explanation of strict vs lenient behavior.

#### Examples

**Basic validation (lenient mode):**
```bash
atomize validate templates/backend-api.yaml
```

**Verbose output:**
```bash
atomize validate templates/backend-api.yaml --verbose
```

**Strict mode (warnings become errors):**
```bash
atomize validate templates/backend-api.yaml --strict
```

**Validate multiple templates in CI:**
```bash
for template in templates/*.yaml; do
  atomize validate "$template" --strict --quiet
done
```

#### Output

**Valid template:**
```
Template is valid!

Summary:
  Name: Backend API Development
  Tasks: 6
  Total Estimation: 100%

Ready to use with: atomize generate templates/backend-api.yaml
```

**Invalid template:**
```
Template validation failed

Errors:
  ✗ tasks: Total estimation is 70%, but must be 100%
     💡 Add 30% to existing tasks or create a new task with 30% estimation.

  ✗ tasks[2].dependsOn: Task depends on non-existent task ID: "nonexistent-task"
     💡 Either add a task with id: "nonexistent-task" or update the dependsOn field.

Warnings:
  ⚠ tasks[1].condition: Condition "true" might be invalid (no variables found)
     💡 Use variables like ${story.tags} or operators like CONTAINS, ==, !=.

Fix the errors above and try again.
```

#### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Template is valid |
| `1` | Template validation failed |

---

### template create

Create a new template using one of several methods.

#### Usage

```bash
atomize template create [options]
atomize tpl create [options]  # alias
```

#### Options

| Option | Type | Description |
|--------|------|-------------|
| `--preset <name>` | string | Start from a preset: `backend-api`, `frontend-feature`, `bug-fix`, `fullstack` |
| `--from-stories <ids>` | string | Learn template from multiple stories (comma-separated IDs) |
| `--profile <name>` | string | Named connection profile for `--from-stories` (see `auth add`) |
| `-p, --platform <platform>` | string | Platform for `--from-stories` (default: `azure-devops`) |
| `--no-normalize` | flag | Keep original estimation percentages (default normalizes to 100%) |
| `--scratch` | flag | Jump directly to the interactive wizard (skips mode selection) |
| `-o, --output <path>` | string | Output file path (default: `createdTemplates/template-YYYYMMDD-XXXX.yaml`) |
| `-q, --quiet` | flag | Suppress non-essential output |

#### Creation Modes

**1. From Preset**

Start with a battle-tested built-in template.

```bash
# Interactive preset selection
atomize template create --preset

# Direct preset selection
atomize template create --preset backend-api
```

Available presets:

| Preset | Description | Tasks |
|--------|-------------|-------|
| `backend-api` | Backend API with database integration | 6 tasks |
| `frontend-feature` | React/Vue UI component development | 5 tasks |
| `bug-fix` | Bug investigation and resolution | 4 tasks |
| `fullstack` | Complete full-stack feature | 8 tasks |

---

**2. Learn from Multiple Stories**

Analyze multiple stories to detect patterns and build a higher-confidence template.

```bash
atomize template create --from-stories STORY-1,STORY-2,STORY-3

atomize template create \
  --from-stories STORY-123,STORY-456,STORY-789 \
  --platform azure-devops \
  --output learned-templates/api-pattern.yaml
```

Pattern detection includes confidence scoring, outlier detection, and conditional task suggestions. See [Story Learner](./Story-Learner.md) for details.

---

**3. Interactive Wizard (From Scratch)**

Step-by-step guided builder for full control over every aspect.

```bash
atomize template create --scratch
atomize template create --scratch --output my-templates/custom.yaml
```

The wizard walks through 6 steps:
1. **Basic Information** — name, description, author, tags
2. **Filter Configuration** — work item types, states, tags, area paths, etc.
3. **Task Configuration** — add tasks with estimations, conditions, dependencies
4. **Estimation Settings** — rounding, minimum points
5. **Validation Rules** — optional constraints
6. **Metadata** — optional categorization info

After all steps, a preview is shown before saving. See [Template Wizard Guide](./template-wizard-guide.md) for the full walkthrough.

#### Output

Templates are saved to:
- **Default path:** `./createdTemplates/template-YYYYMMDD-XXXX.yaml`
- **Custom path:** Specified with `-o` / `--output`

```
Template created successfully!

Template saved to: createdTemplates/template-20260101-a3f2.yaml

Validate it:   atomize validate createdTemplates/template-20260101-a3f2.yaml
Test it:       atomize generate createdTemplates/template-20260101-a3f2.yaml --platform mock
Use it:        atomize generate createdTemplates/template-20260101-a3f2.yaml --execute
```

---

### template presets

List all available built-in template presets.

#### Usage

```bash
atomize template presets
atomize template ls       # alias
atomize tpl presets       # alias
atomize tpl ls            # alias
```

#### Output

```
Available Template Presets

backend-api
  Backend API Development
  Standard backend API development with database integration

frontend-feature
  Frontend Feature Development
  UI/UX feature development with React/Vue components

bug-fix
  Bug Fix
  Standard bug investigation and resolution workflow

fullstack
  Fullstack Feature Development
  Complete full-stack feature with backend and frontend work

Use with: atomize template create --preset <name>
```

---

## Configuration

### Connection Profiles

Azure DevOps credentials are managed as named profiles using the `auth` commands. Profiles are stored at `~/.atomize/connections.json` and tokens are kept in the OS keychain. When the keychain is unavailable, `--insecure-storage` enables an insecure local file fallback. The token data is encrypted, but the key lives in the same directory, so treat it as unprotected against a local attacker.

```bash
# Add a profile
atomize auth add work-ado

# Verify it works
atomize auth test work-ado

# Use it in generate
atomize generate templates/backend-api.yaml --profile work-ado

# Or set it as default so --profile is not needed
atomize auth use work-ado
atomize generate templates/backend-api.yaml
```

### Environment Variables

**Authentication:**

```bash
# macOS / Linux
export ATOMIZE_PAT="your-personal-access-token"
```
```powershell
# Windows (PowerShell)
$env:ATOMIZE_PAT = "your-personal-access-token"
```
```cmd
# Windows (Command Prompt)
set ATOMIZE_PAT=your-personal-access-token
```

**Profile selection:**

```bash
# macOS / Linux
export ATOMIZE_PROFILE="work-ado"
```
```powershell
# Windows (PowerShell)
$env:ATOMIZE_PROFILE = "work-ado"
```

Profile resolution order for `generate`:
1. `--profile <name>` flag
2. `ATOMIZE_PROFILE` environment variable
3. Default profile (set via `atomize auth use`)

**Logging:**

```bash
export LOG_LEVEL="info"   # debug, info, warn, error
```

### .env File

```bash
ATOMIZE_PROFILE=work-ado
```

---

## Interactive Prompts & Navigation

Atomize uses interactive terminal prompts throughout. Here are the keyboard shortcuts:

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate between options in a list |
| `Enter` | Confirm selection or submit input |
| `Space` | Toggle selection (in multi-select prompts) |
| `Ctrl+C` | Cancel the current operation and exit |

When you cancel with `Ctrl+C`, no files are created or modified.

---

## Examples

### Complete Workflow: Azure DevOps

```bash
# 1. Save your credentials as a named profile
atomize auth add work-ado
# Prompts for org URL, project, team, and PAT
# Set it as default when prompted

# 2. Verify the connection
atomize auth test work-ado

# 3. Create a template
atomize template create --preset backend-api -o my-backend.yaml

# 4. Validate it
atomize validate my-backend.yaml

# 5. Preview (dry run — default, no --execute)
atomize generate my-backend.yaml

# 6. Execute
atomize generate my-backend.yaml --execute
```

### Multi-Story Learning

```bash
atomize template create \
  --from-stories STORY-1,STORY-2,STORY-3,STORY-4,STORY-5 \
  --platform azure-devops \
  --output team-templates/backend-standard.yaml

atomize validate team-templates/backend-standard.yaml --strict --verbose
atomize generate team-templates/backend-standard.yaml --execute
```

### CI/CD Integration

Create a profile once (locally or in a setup step) and reference it by name in CI. The profile name can be passed via `--profile` or the `ATOMIZE_PROFILE` env var.

```yaml
# .github/workflows/generate-tasks.yml
name: Generate Tasks

on:
  push:
    paths: ['templates/*.yaml']

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
            --pat-stdin

      - name: Validate Templates
        run: |
          for template in templates/*.yaml; do
            atomize validate "$template" --strict --quiet
          done

      - name: Generate Tasks
        run: |
          atomize generate templates/backend-api.yaml \
            --execute \
            --output task-report.json \
            --continue-on-error

      - name: Upload Report
        uses: actions/upload-artifact@v4
        with:
          name: task-report
          path: task-report.json
```

### Batch Processing

```bash
#!/bin/bash
for template in templates/*.yaml; do
  echo "Processing: $template"
  atomize generate "$template" --execute --continue-on-error --quiet
done
```

---

## Troubleshooting

### "Not authenticated" error

```bash
# Check what profiles are saved
atomize auth list

# Add a profile if none exist
atomize auth add work-ado

# Test the profile
atomize auth test work-ado

# Use it explicitly
atomize generate templates/backend-api.yaml --profile work-ado

# Or set it as default
atomize auth use work-ado
```

### "Template validation failed"

```bash
# Get detailed output
atomize validate templates/my-template.yaml --verbose

# Common causes:
# - Estimation percentages don't sum to 100%
# - Task dependency references a non-existent ID
# - Missing required fields (title, version, name)
```

### "No matching stories found"

```bash
# Test with mock platform first
atomize generate templates/my-template.yaml --platform mock

# Make filter less restrictive:
# - Add more states: ["New", "Active", "Approved"]
# - Remove or broaden tag filters
# - Set excludeIfHasTasks: false
```

### Permission denied (Windows)

```powershell
# Run PowerShell as Administrator
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Or use npx
npx @sppg2001/atomize generate templates/backend-api.yaml
```

### Enable debug logging

```bash
export LOG_LEVEL="debug"
atomize generate templates/backend-api.yaml --verbose
```

---

## See Also

- [Template Reference](./Template-Reference.md) - Complete template schema
- [Validation Modes](./Validation-Modes.md) - Strict vs lenient validation explained
- [Common Validation Errors](./Common-Validation-Errors.md) - Fix specific validation errors
- [Platform Guide](./Platform-Guide.md) - Platform setup and configuration
- [Story Learner](./Story-Learner.md) - Generate templates from existing work items
- [Template Wizard Guide](./template-wizard-guide.md) - Interactive wizard walkthrough
- [Examples](../examples/) - Real-world template examples
