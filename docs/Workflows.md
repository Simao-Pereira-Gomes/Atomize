# Atomize Workflows

This guide is organized by the work users are trying to do. Each workflow starts with the VS Code path and gives the CLI equivalent where useful.

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
version: "1.0"
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

For all fields, composition, conditions, custom fields, and estimation behavior, see [Template Reference](./Template-Reference.md).

## Validate A Template

Validation catches template errors before preview or generation.

In VS Code:

1. Run **Atomize: Validate**.
2. Choose offline validation for structure-only checks.
3. Choose online validation when you need Azure DevOps field and saved-query verification.

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

Connected validation, live preview, and generation use Azure DevOps connection profiles.

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

## Generate Tasks

Generation is intentionally split into preview and creation.

In VS Code:

1. Run **Atomize: Generate**.
2. Select a connection profile.
3. Optionally enter specific story IDs.
4. Review the generated dry-run report.
5. Use the panel action to create tasks only when the plan is correct.
6. Confirm the final VS Code prompt.

From the CLI:

```bash
# Dry run, no tasks created
atomize generate template:backend-api --profile work-ado

# Create tasks after interactive confirmation
atomize generate template:backend-api --profile work-ado --execute
```

Non-interactive live execution requires explicit acknowledgement:

```bash
atomize generate template:backend-api \
  --profile work-ado \
  --execute \
  --auto-approve
```

## Create Or Customize Templates

Choose the creation path based on what you already have.

| Goal | Recommended path |
|---|---|
| Start from a known pattern | Browse the catalog or run `atomize template create --from <name>` |
| Build manually | Use the template wizard or edit YAML directly |
| Capture team practice | Use Story Learner with existing stories that already have tasks |
| Draft from prose | Use AI-assisted template creation |
| Reuse shared task groups | Create a mixin and include it from templates |

See [Template Creation](./Template-Creation.md) for creation workflows and [Story Learner](./Story-Learner.md) for the deeper pattern-learning guide.

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

Azure DevOps and GitHub Models profiles have independent defaults. GitHub Models profiles are only needed for AI-assisted template creation.

## Automate With The CLI

Automation should validate templates before live execution.

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

Use `--auto-approve` only in jobs where task creation is intentional. See [CLI Reference](./Cli-Reference.md) and [Auth Guide](./Auth-Guide.md) for full automation details.

## Troubleshooting

### Atomize CLI Not Found

Install the CLI:

```bash
npm install -g @sppg2001/atomize
```

If VS Code still cannot find it, set `atomize.cliPath`.

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

Common causes include estimation percentages that do not sum to 100, invalid dependency IDs, missing task titles, and custom fields that need online validation.
