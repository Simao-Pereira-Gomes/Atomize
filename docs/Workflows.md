# Atomize Workflows

This guide is organized by the work users are trying to do. Each workflow starts with the VS Code path and gives the CLI equivalent where useful.<!-- atomize:feature studio --> For the same workflows in Atomize Studio's desktop authoring surfaces, see [Atomize Studio](./Atomize-Studio.md).<!-- /atomize:feature -->

Atomize is designed around platform adapters. Today, connected generation supports Azure DevOps. Mock is available for offline testing.

## Table Of Contents

- [Try Atomize Without Credentials](#try-atomize-without-credentials)
- [Author A Template](#author-a-template)
- [Validate A Template](#validate-a-template)
- [Preview Generated Tasks](#preview-generated-tasks)
- [Connect Azure DevOps](#connect-azure-devops)
- [Generate Tasks](#generate-tasks)
- [Create Or Customize Templates](#create-or-customize-templates)
- [Manage Profiles](#manage-profiles)
- [Automate With The CLI](#automate-with-the-cli)
- [Troubleshooting](#troubleshooting)

<!-- atomize:section workflow-basics -->

## Try Atomize Without Credentials

Use Mock Preview when you want to understand the product or test template logic before connecting to Azure DevOps.

In VS Code:

1. Open an `.atomize.yaml` file.
2. Run **Atomize: Validate**.
3. Run **Atomize: Preview (Mock)**.
4. Enter mock story field values when prompted.

From the CLI:

```bash
atomize generate template:backend-api --platform mock
```

Mock preview does not connect to a platform and does not create tasks.

## Author A Template

Use `.atomize.yaml`, `.atomize.yml`, or a first-line `# atomize-yaml` marker for the full VS Code authoring surface.

VS Code authoring includes:

- schema hovers and completions
- snippets for templates and mixins
- save-time diagnostics
- CodeLens actions for Validate, Preview, and Generate
- quick fixes for supported validation warnings

Minimal template:

```yaml
formatVersion: "1.0"
name: "Feature Breakdown"

filter:
  workItemTypes: ["User Story"]
  states: ["New", "Active"]

tasks:
  - title: "Design: ${story.title}"
    estimationPercent: 20
  - title: "Build: ${story.title}"
    estimationPercent: 60
  - title: "Validate: ${story.title}"
    estimationPercent: 20
```

For field shapes, defaults and constraints, see the [Schema Reference](https://atomize-docs.pages.dev/schema). For composition, conditions, custom fields and estimation behavior, see the [Template Reference](./Template-Reference.md).

## Validate A Template

Validation catches template errors before preview or generation.

In VS Code:

1. Run **Atomize: Validate**.
2. Choose Offline Validation for structure-only checks.
3. Choose Online Validation when you need Azure DevOps field and saved-query verification.

From the CLI:

```bash
atomize validate my-template.atomize.yaml
atomize validate my-template.atomize.yaml --strict
atomize validate my-template.atomize.yaml --profile work-ado
```

Use strict mode for team templates and CI because warnings become failures. See [Validation Modes](./Validation-Modes.md) and [Common Validation Errors](./Common-Validation-Errors.md).

## Preview Generated Tasks

Preview lets you inspect the generated task plan before any task is created.

In VS Code:

- **Atomize: Preview (Mock)** uses entered story fields and does not need credentials.
- **Atomize: Preview (Live)** reads a real Azure DevOps story through a selected profile and renders a dry-run task breakdown.

From the CLI:

```bash
# Offline mock preview
atomize generate template:backend-api --platform mock

# Inspect which story fields the template references
atomize preview template:backend-api --inspect

# Live dry run against Azure DevOps
atomize generate template:backend-api --profile work-ado

# Dry run for explicit story IDs
atomize generate template:backend-api --profile work-ado --story 123 456
```

Dry runs do not create tasks.

## Connect Azure DevOps

Connected validation, live preview, and generation use Azure DevOps Connection Profiles.

In VS Code:

1. Run **Atomize: Manage Profiles**.
2. Add an Azure DevOps profile.
3. Test the profile.
4. Set a workspace default profile if this repository should preselect it.

From the CLI:

```bash
atomize auth add work-ado
atomize auth test work-ado
atomize auth use work-ado
```

Your Azure DevOps PAT needs Work Items read/write access. See [Auth Guide](./Auth-Guide.md) for storage, profile resolution, token rotation, and CI setup.

<!-- /atomize:section -->

## Generate Tasks

Generation is intentionally split into preview and creation.

<!-- atomize:section workflow-vscode-generate -->

### Generate In VS Code

1. Run **Atomize: Generate**.
2. Select a connection profile.
3. Tick Stories in the Story Browser, or press Enter with none ticked to use every Story the Template's filter matches.
4. Review the dry-run report in the Generate Panel.
5. Choose **Create *N* Tasks** only when the plan is correct.
6. Confirm the final VS Code prompt.

See [Atomize: Generate](./VS-Code-Extension.md#atomize-generate) for what each step shows and how failures are reported.

<!-- /atomize:section -->

### Generate From The CLI

<!-- atomize:section workflow-cli-generate -->

Continue from the [CLI quickstart](../README.md#start-with-the-cli): the same `generate` command previews against real Stories once you have a Connection Profile, and only creates Tasks when you ask it to.

1. [Set up an Azure DevOps Connection Profile](./Auth-Guide.md#quick-setup) and make it the default, or pass `--profile <name>` on each command.
2. Choose the Stories. By default `generate` uses the Template's `filter`. Pass `--story <ids...>` to target specific work items instead (the filter is bypassed, but `excludeIfHasTasks` still applies), or `--limit <n>` to cap how many matching items are processed.
3. Run a dry run. It is the default: without `--execute`, `generate` reads Stories and prints the planned Tasks without creating anything.
4. Create the Tasks with `--execute` once the plan is right.

```bash
# Dry run against real Stories, no Tasks created
atomize generate template:backend-api --profile work-ado --story 123

# Create Tasks after confirming in the terminal
atomize generate template:backend-api --profile work-ado --story 123 --execute
```

A dry run prints the plan and ends by saying nothing was created. This transcript uses the built-in Mock platform (`--platform mock`) so it runs without credentials; with a Connection Profile the `Connected` line names Azure DevOps:

```text
●  Dry-run mode: no tasks will be created
Connected: Mock Platform v1.0.0 ✓
Found 1 stories
✓ [1/1] STORY-001: Implement user authentication API

 Summary:
  Stories processed: 1
  Tasks calculated:  6
  Tasks created:     0

✓ STORY-001: Implement user authentication API
  Distribution: 8 hours (100%)
  Task breakdown:
    - Design API Endpoints: Implement user authentication API: 1 hours (15%)
    - Implement Core Logic: Implement user authentication API: 3 hours (35%)
    ...

Dry run complete. No tasks were created.
  Run with --execute to create tasks for real.
```

With `--execute` in an interactive terminal, Atomize shows what it is about to change and asks before creating anything. The answer defaults to no, and answering no exits without creating Tasks:

```text
⚠  LIVE MODE
Template:  Backend API Development
Stories:   123 (template filter bypassed)
Platform:  azure-devops

This will CREATE tasks in your work tracking system.

◆  Proceed with task creation?
   ○ Yes / ● No
```

After you confirm, the summary reports the Tasks created:

```text
 Summary:
  Stories processed: 1
  Stories success:   1
  Tasks calculated:  6
  Tasks created:     6

Created 6 tasks for 1 story.
```

Without an interactive terminal (a script or CI job), `--execute` refuses to run unless you also pass `--auto-approve`, which acknowledges that Tasks will be created without a prompt:

```text
└  Refusing live execution without confirmation in non-interactive mode. Re-run with --auto-approve to acknowledge task creation.
```

**When Tasks are created:** only with `--execute`, and only after you confirm or pass `--auto-approve`. Press Ctrl+C at any prompt to cancel. Once creation has started, interrupting the process stops it, but Tasks already created stay in Azure DevOps.

**Results and exit codes:** `generate` exits `0` when every Story succeeded (including a dry run), `1` when one or more Stories failed or the run was refused, `2` when no Stories matched, and `3` when authentication failed. By default the run stops after the first failing Story; pass `--continue-on-error` to keep processing the rest. To retry only the Stories that failed, re-run with `--story`; with `excludeIfHasTasks: true` in the Template, Stories that already received Tasks are skipped.

See [Automate With The CLI](#automate-with-the-cli) for scripts and CI, and the [`generate` reference](./Cli-Reference.md#generate) for every option.

<!-- /atomize:section -->

<!-- atomize:section workflow-customize -->

## Create Or Customize Templates

Choose the creation path based on what you already have.

| Goal | Recommended path |
|---|---|
| Start from a known pattern | Browse the Catalog or run `atomize template create --from <name>` |
| Build manually | Use the template wizard or edit YAML directly |
| Capture team practice | Use AI-assisted creation with your written process as a Reference Document |
| Draft from prose | Use AI-assisted template creation |
| Reuse shared task groups | Create a mixin and include it from templates |

See [Template Creation](./Template-Creation.md) for creation workflows.

## Manage Profiles

Profiles keep credentials out of command flags and editor settings.

In VS Code, run **Atomize: Manage Profiles** to add, test, rotate, remove, and set defaults.

From the CLI:

```bash
atomize auth list
atomize auth add work-ado
atomize auth test work-ado
atomize auth rotate work-ado
atomize auth remove old-profile
```

Azure DevOps profiles have their own default, set with `atomize auth use`. AI-assisted template creation does not use a Connection Profile at all: it authenticates through a separate Copilot Session; see [Auth Guide](./Auth-Guide.md).

<!-- /atomize:section -->

## Automate With The CLI

<!-- atomize:section workflow-cli-automation -->

Automation should validate Templates before live execution, authenticate from a secrets store, and treat Task creation as an explicit step.

```yaml
name: Atomize

on:
  workflow_dispatch:

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Atomize
        run: npm install -g @sppg2001/atomize

      - name: Validate templates
        run: atomize validate template:backend-api --strict --quiet

      - name: Configure profile
        env:
          AZURE_DEVOPS_PAT: ${{ secrets.AZURE_DEVOPS_PAT }}
        run: |
          echo "$AZURE_DEVOPS_PAT" | atomize auth add ci \
            --org-url "${{ secrets.AZURE_DEVOPS_ORG_URL }}" \
            --project "${{ secrets.AZURE_DEVOPS_PROJECT }}" \
            --team "${{ secrets.AZURE_DEVOPS_TEAM }}" \
            --default \
            --pat-stdin \
            --insecure-storage

      - name: Generate tasks
        run: |
          atomize generate template:backend-api \
            --execute \
            --auto-approve \
            --output report.json
```

Use `--auto-approve` only in jobs where Task creation is intentional. A job that should only check the plan can run the same command without `--execute`: dry runs never create Tasks.

### Authentication

Create a short-lived Connection Profile in the job from your secrets store, and pass the token through `--pat-stdin` so it stays out of process listings and logs. See [CI/CD Setup](./Auth-Guide.md#cicd-setup) for the full options and [Profile Resolution Order](./Auth-Guide.md#profile-resolution-order) for how commands choose a profile.

### Machine-readable output

| Command | Output |
|---------|--------|
| `generate --output <file>` | Writes the run's JSON report to a file alongside the normal terminal output. Descriptions, custom field values, and raw platform data are left out unless you pass `--include-sensitive-report-data`. |
| `generate --json` | Prints the JSON report to stdout and nothing else. It runs a dry run unless you also pass `--execute`. |
| `generate --json-stream` | Prints newline-delimited JSON: a `{"event":"progress",...}` line per progress event, then a final `{"event":"report",...}` line. |
| `validate --output json` | Prints the validation result as JSON to stdout. |
| `auth list --json`, `template list --json`, `fields list --json`, `queries list --json` | Print results as JSON to stdout, with progress on stderr. |

`--json` and `--json-stream` cannot be combined, and both imply `--quiet`.

### Exit codes and failure handling

| Code | `generate` | `validate` |
|------|------------|------------|
| `0` | Every Story succeeded, including a dry run | The Template is valid |
| `1` | One or more Stories failed, or the run was refused | Validation failed |
| `2` | No Stories matched the filter or `--story` IDs | |
| `3` | Authentication failed | |

The exit codes are the same with `--json` and `--json-stream`. A run with no matching Stories exits `2` and still prints its report, with `storiesProcessed: 0`.

- By default `generate` stops after the first failing Story. `--continue-on-error` processes the rest and still exits `1` if any failed.
- Test against a few items with `--limit <n>` before a full `--execute` run.
- Re-run failed Stories with `--story <ids...>`. With `excludeIfHasTasks: true` in the Template, Stories that already received Tasks are skipped, so a retry does not duplicate them.

See the [CLI Reference](./Cli-Reference.md#commands-overview) for every command and flag.

<!-- /atomize:section -->

## Troubleshooting

<!-- atomize:section workflow-troubleshooting -->

### Atomize Command Not Found

This applies to terminal/CI use of the CLI only: the VS Code extension runs Atomize directly and does not need the CLI installed. Install the CLI:

```bash
npm install -g @sppg2001/atomize
```

### No Stories Found

Run a dry run with a known story ID:

```bash
atomize generate my-template.atomize.yaml --profile work-ado --story 123
```

If that works, broaden the template filter or inspect saved-query results.

### Authentication Failed

```bash
atomize auth list
atomize auth test work-ado
atomize auth rotate work-ado
```

Verify the PAT has Work Items read/write access.

### Validation Failed

Run strict validation for clearer failures:

```bash
atomize validate my-template.atomize.yaml --strict
```

Common causes include estimation percentages that do not sum to 100, invalid dependency IDs, missing task titles, and custom fields that need [Online Validation](./Validation-Modes.md#offline-and-online-validation). See [Common Validation Errors](./Common-Validation-Errors.md) for each message and its fix.

<!-- /atomize:section -->
