# Atomize CLI Reference

Complete command-line interface documentation for Atomize v1.1.

## Table of Contents

- [Installation](#installation)
- [Global Options](#global-options)
- [Commands Overview](#commands-overview)
- [Command Reference](#command-reference)
  - [generate](#generate)
  - [validate](#validate)
  - [template create](#template-create)
  - [template list](#template-list)
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
| `generate` | `gen` | Generate tasks from user stories using a template |
| `validate` | - | Validate a template file |
| `template` | `tpl` | Template management commands |
| `template create` | - | Create a new template interactively |
| `template list` | `ls` | List available template presets |

---

## Command Reference

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
| `--project <name>` | string | - | Override the project name |
| `--dry-run` | flag | `true` | Preview tasks without creating them (default) |
| `--execute` | flag | - | Actually create tasks in the platform |
| `--continue-on-error` | flag | - | Keep processing other stories if one fails |
| `--story-concurrency <n>` | number | `3` | Max stories processed in parallel (max: 10) |
| `--task-concurrency <n>` | number | `5` | Max tasks created in parallel per story (max: 20) |
| `--dependency-concurrency <n>` | number | `5` | Max dependency links created in parallel (max: 10) |
| `-v, --verbose` | flag | - | Show detailed output including per-task breakdown |
| `--no-interactive` | flag | - | Skip all prompts (requires template arg and env vars) |
| `-o, --output <file>` | string | - | Write a JSON report to this file path (for CI/CD) |
| `-q, --quiet` | flag | - | Suppress non-essential output |

#### Examples

**Interactive mode (no template specified):**
```bash
atomize generate
# Prompts for: template file, platform, dry-run preference
```

**Dry run with explicit template:**
```bash
atomize generate templates/backend-api.yaml --dry-run
```

**Execute for real:**
```bash
atomize generate templates/backend-api.yaml --execute
```

**Mock platform (no credentials needed):**
```bash
atomize generate templates/backend-api.yaml --platform mock --dry-run
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

**Non-interactive for CI/CD with JSON report:**
```bash
atomize generate templates/backend-api.yaml \
  --execute \
  --no-interactive \
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
| `-l, --lenient` | flag | - | Use lenient mode: warnings are non-blocking (default) |
| `--no-interactive` | flag | - | Run without prompts (suitable for CI/scripts) |
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
| `--ai <prompt>` | string | Generate template using AI with this description |
| `--ai-provider <provider>` | string | Force AI provider: `gemini` or `ollama` |
| `--api-key <key>` | string | Google Gemini API key (if not in `GOOGLE_AI_API_KEY` env var) |
| `--model <name>` | string | AI model name (e.g., `gemini-2.0-flash-exp`, `llama3.2`) |
| `--preset <name>` | string | Start from a preset: `backend-api`, `frontend-feature`, `bug-fix`, `fullstack` |
| `--from-story <id>` | string | Learn template from a single existing story |
| `--from-stories <ids>` | string | Learn template from multiple stories (comma-separated IDs) |
| `-p, --platform <platform>` | string | Platform for `--from-story` / `--from-stories` (default: `azure-devops`) |
| `--normalize` | flag | Normalize task estimation percentages to 100% |
| `--no-normalize` | flag | Keep original estimation percentages |
| `--scratch` | flag | Jump directly to the interactive wizard (skips mode selection) |
| `-o, --output <path>` | string | Output file path (default: `createdTemplates/template-YYYYMMDD-XXXX.yaml`) |
| `--no-interactive` | flag | Skip all prompts (use with flags only, for automation) |
| `-q, --quiet` | flag | Suppress non-essential output |

#### Creation Modes

**1. AI-Powered (Free)**

Generate templates from natural language descriptions using Google Gemini or local Ollama.

```bash
# Interactive provider selection
atomize template create --ai "backend API with JWT auth and rate limiting"

# Force Gemini (requires GOOGLE_AI_API_KEY env var)
atomize template create --ai "React dashboard" --ai-provider gemini

# Force Ollama (local, completely free)
atomize template create --ai "bug fix workflow" --ai-provider ollama --model llama3.2
```

After generation, you can interactively:
- **Accept** — Save the template as-is
- **Refine** — Provide feedback to improve it
- **Regenerate** — Generate a fresh version
- **Cancel** — Discard and exit

**Setup for Gemini:**
```bash
export GOOGLE_AI_API_KEY="your-api-key-here"
# Get a free key at https://makersuite.google.com/app/apikey
```

**Setup for Ollama:**
```bash
ollama pull llama3.2   # Download a model
ollama serve           # Start the server
```

---

**2. From Preset**

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

**3. Learn from an Existing Story**

Analyze a story that already has tasks and create a reusable template from it.

```bash
atomize template create --from-story STORY-123 --platform azure-devops
atomize template create --from-story STORY-123 --normalize
atomize template create --from-story STORY-001 --platform mock  # Testing
```

---

**4. Learn from Multiple Stories**

Analyze multiple stories to detect patterns and build a higher-confidence template.

```bash
atomize template create --from-stories STORY-1,STORY-2,STORY-3

atomize template create \
  --from-stories STORY-123,STORY-456,STORY-789 \
  --platform azure-devops \
  --normalize \
  --output learned-templates/api-pattern.yaml
```

Pattern detection includes confidence scoring, outlier detection, and conditional task suggestions. See [Story Learner](./Story-Learner.md) for details.

---

**5. Interactive Wizard (From Scratch)**

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
Test it:       atomize generate createdTemplates/template-20260101-a3f2.yaml --platform mock --dry-run
Use it:        atomize generate createdTemplates/template-20260101-a3f2.yaml --execute
```

---

### template list

List all available built-in template presets.

#### Usage

```bash
atomize template list
atomize template ls       # alias
atomize tpl list          # alias
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

### Environment Variables

**Azure DevOps (required for azure-devops platform):**

```bash
export AZURE_DEVOPS_ORG_URL="https://dev.azure.com/myorg"  # Required
export AZURE_DEVOPS_PROJECT="MyProject"                     # Required
export AZURE_DEVOPS_PAT="your-personal-access-token"        # Required
export AZURE_DEVOPS_TEAM="MyTeam"                           # Optional
```

**AI Template Generation:**

```bash
export GOOGLE_AI_API_KEY="your-gemini-api-key"  # For Google Gemini
```

**Logging:**

```bash
export LOG_LEVEL="info"   # debug, info, warn, error
```

### .env File

You can place all variables in a `.env` file in your working directory:

```bash
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/myorg
AZURE_DEVOPS_PROJECT=MyProject
AZURE_DEVOPS_PAT=your-personal-access-token
AZURE_DEVOPS_TEAM=MyTeam
GOOGLE_AI_API_KEY=your-gemini-api-key
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
# 1. Configure credentials
export AZURE_DEVOPS_ORG_URL="https://dev.azure.com/myorg"
export AZURE_DEVOPS_PROJECT="MyProject"
export AZURE_DEVOPS_PAT="your-pat-here"

# 2. Create a template
atomize template create --preset backend-api -o my-backend.yaml

# 3. Validate it
atomize validate my-backend.yaml

# 4. Preview (dry run)
atomize generate my-backend.yaml --dry-run

# 5. Execute
atomize generate my-backend.yaml --execute
```

### AI-Powered Template

```bash
export GOOGLE_AI_API_KEY="your-key"

# Generate and interactively refine
atomize template create --ai "REST API with PostgreSQL and Redis caching"

# Then use it
atomize generate createdTemplates/template-*.yaml --dry-run
```

### Multi-Story Learning

```bash
atomize template create \
  --from-stories STORY-1,STORY-2,STORY-3,STORY-4,STORY-5 \
  --platform azure-devops \
  --normalize \
  --output team-templates/backend-standard.yaml

atomize validate team-templates/backend-standard.yaml --strict --verbose
atomize generate team-templates/backend-standard.yaml --execute
```

### CI/CD Integration

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

      - name: Validate Templates
        run: |
          for template in templates/*.yaml; do
            atomize validate "$template" --strict --quiet
          done

      - name: Generate Tasks
        env:
          AZURE_DEVOPS_ORG_URL: ${{ secrets.AZURE_DEVOPS_ORG_URL }}
          AZURE_DEVOPS_PROJECT: ${{ secrets.AZURE_DEVOPS_PROJECT }}
          AZURE_DEVOPS_PAT: ${{ secrets.AZURE_DEVOPS_PAT }}
        run: |
          atomize generate templates/backend-api.yaml \
            --execute \
            --no-interactive \
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
# Check your environment variables
echo $AZURE_DEVOPS_ORG_URL
echo $AZURE_DEVOPS_PROJECT
echo $AZURE_DEVOPS_PAT

# Or use interactive mode (will prompt for credentials)
atomize generate templates/backend-api.yaml
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
atomize generate templates/my-template.yaml --platform mock --dry-run

# Make filter less restrictive:
# - Add more states: ["New", "Active", "Approved"]
# - Remove or broaden tag filters
# - Set excludeIfHasTasks: false
```

### "AI provider not available"

```bash
# For Gemini
export GOOGLE_AI_API_KEY="your-api-key"

# For Ollama — make sure it's running
ollama serve
ollama pull llama3.2

# Verify Ollama is accessible
curl http://localhost:11434/api/tags
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
