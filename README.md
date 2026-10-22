# Atomize

[![CI](https://github.com/Simao-Pereira-Gomes/atomize/actions/workflows/ci.yml/badge.svg)](https://github.com/Simao-Pereira-Gomes/atomize/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Simao-Pereira-Gomes/atomize/actions/workflows/codeql.yml/badge.svg)](https://github.com/Simao-Pereira-Gomes/atomize/actions/workflows/codeql.yml)
[![NPM Version](https://img.shields.io/npm/v/@sppg2001/atomize)](https://www.npmjs.com/package/@sppg2001/atomize)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/node/v/@sppg2001/atomize)](https://nodejs.org)

**Break down stories, build up velocity.**

<!-- atomize:section onboarding-overview -->

Atomize turns Stories into consistent child Tasks using reusable YAML Templates. Capture your team's task breakdown once, then preview and reuse it as new Stories arrive.

Use <!-- atomize:feature studio -->Atomize Studio for a standalone visual workflow, <!-- /atomize:feature -->VS Code for guided authoring in your editor<!-- atomize:feature studio -->,<!-- /atomize:feature --> or the CLI for terminal workflows and automation. Connected generation supports Azure DevOps. Mock Preview lets you try a Template without a platform connection.

<!-- /atomize:section -->

## What You Can Do

- Author Atomize YAML with schema hovers, completions, snippets, diagnostics, and CodeLens actions in VS Code, or visually in Atomize Studio.
- Preview task breakdowns with mock story data before connecting to a real platform.
- Run live dry-runs against Azure DevOps stories before creating anything.
- Generate child tasks only after reviewing the plan and confirming execution.
- Reuse built-in, user, and project-scoped templates and mixins.
- Create templates from the catalog, from scratch, or from an AI-assisted draft, and ask AI to propose improvements to existing ones.
- Automate validation and generation from the CLI in CI/CD.

## Start With VS Code

1. Install the [Atomize extension](./docs/VS-Code-Extension.md) from the Marketplace or a packaged release. It runs directly in the editor: no separate CLI install needed.
2. Open or create an `.atomize.yaml` file.
3. Run **Atomize: Validate**.
4. Run **Atomize: Preview (Mock)** to test the template offline.
5. Run **Atomize: Manage Profiles** when you are ready to connect Azure DevOps.
6. Run **Atomize: Preview (Live)** to dry-run against a real story.
7. Run **Atomize: Generate** to review the task plan and create tasks after confirmation.

Use `.atomize.yaml`, `.atomize.yml`, or a first-line `# atomize-yaml` marker for the full editor experience. Full reference: [VS Code Extension](./docs/VS-Code-Extension.md).

## Start With Atomize Studio

1. Download the installer for your OS from the latest [Studio release](./docs/Studio-Releases.md) (macOS, Windows, or experimental Linux) and launch Atomize Studio.
2. In the **Templates** area, start from scratch, clone a Catalog template, open a local Atomize YAML file, or draft one with AI.
3. Add a Connection Profile in **Global Settings** when you are ready to connect Azure DevOps.
4. Use the **Generate** area to dry-run and, after confirmation, execute against a real story.
5. Use the **Catalog** area to install or remove templates for reuse.

Full reference: [Atomize Studio](./docs/Atomize-Studio.md).

## Start With The CLI

<!-- atomize:section cli-quickstart -->

### Install the CLI

Install [Node.js](https://nodejs.org/) 22 or later, which includes npm. Then install Atomize and check that your terminal can find it:

```bash
npm install -g @sppg2001/atomize
atomize --version
```

The version command prints your installed CLI version. If your terminal cannot find `atomize`, reopen it and check that npm's global executable directory is on your `PATH`.

### Use a built-in Template

The `backend-api` Template is included with the CLI. You can use it directly without creating a file or installing a Catalog item:

```bash
atomize validate template:backend-api
```

This performs Offline Validation. You do not need an Azure DevOps account or a Connection Profile.

### Run your first Mock Preview

Pass a small Mock Story as JSON. Single quotes keep the JSON intact in Bash, Zsh, and PowerShell:

```bash
atomize preview template:backend-api --mock-story '{"id":"123","title":"Add password reset","estimation":8}'
```

The command prints JSON containing three Tasks, each using the Mock Story's title. The Template converts the input Story Estimate of 8 into a 32-hour budget using its example conversion factor of 4, then splits it 20% / 50% / 30%. Here is a shortened transcript of the result:

```text
tasks[0].title: Define API Behavior: Add password reset
tasks[1].title: Implement API Change: Add password reset
tasks[2].title: Verify API Behavior: Add password reset
skippedTasks: []
estimationSummary.storyEstimation: 32
estimationSummary.totalTaskEstimation: 32
estimationSummary.percentageUsed: 100
```

Change `title` or `estimation` in the command and run it again to see how the breakdown changes. Mock Preview neither queries a platform nor creates Work Items. The CLI is installed from npm, but this preview runs offline using the built-in Template.

### Connect when you are ready

To work with real Stories, [set up an Azure DevOps Connection Profile](./docs/Auth-Guide.md#quick-setup) and follow [connected generation](./docs/Workflows.md#generate-from-the-cli). A connected dry run reads Stories without creating Tasks. Task creation requires `--execute` and confirmation; non-interactive execution also requires `--auto-approve`.

See the [CLI Reference](./docs/Cli-Reference.md#preview) for preview options, or [create your own Template](./docs/Template-Creation.md).

<!-- /atomize:section -->

## Safety Model

Atomize previews by default. Task creation requires an explicit Generate flow and confirmation.

| Surface | Connects to platform | Creates tasks |
|---|---:|---:|
| Authoring, snippets, schema hovers | No | No |
| Save-time diagnostics | No | No |
| Validate, offline | No | No |
| Preview (Mock) | No | No |
| Validate, online | Yes | No |
| Preview (Live) | Yes | No |
| Generate dry run | Yes | No |
| Generate confirmed execution | Yes | Yes |

CLI generation follows the same boundary:

```bash
atomize generate template:backend-api          # dry run
atomize generate template:backend-api --execute # create tasks after confirmation
```

Non-interactive live execution requires `--auto-approve`:

```bash
atomize generate template:backend-api --execute --auto-approve
```

## First Template

Start from an existing template unless you already know you need custom YAML.

| Goal | Use |
|---|---|
| Try a known pattern | **Atomize: Browse Catalog** or `atomize template list` |
| Customize a built-in template | `atomize template create --from backend-api` |
| Build manually | `atomize template create --scratch` or edit YAML in VS Code |
| Capture existing team practice | `atomize template create --ai --reference docs/how-we-work.md` |
| Draft from prose | `atomize template create --ai` |

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

See [Template Creation](./docs/Template-Creation.md) for creation workflows and [Schema Reference](https://atomize-docs.pages.dev/schema) for YAML field details. The [Template Reference](./docs/Template-Reference.md) explains behaviour and composition.

## Connect Azure DevOps

Run **Atomize: Manage Profiles** in VS Code, add a profile in Atomize Studio's Global Settings, or use the CLI:

```bash
atomize auth add work-ado
atomize auth test work-ado
```

The Azure DevOps PAT needs Work Items read/write access. Connection Profiles are shared between the CLI and Atomize Studio through the same connections file; each resolves the token through its own OS credential manager when available.

See [Auth Guide](./docs/Auth-Guide.md) and [Platform Guide](./docs/Platform-Guide.md) for details.

## CLI Essentials

```bash
# Validate a template
atomize validate template:backend-api

# Preview with mock data, no credentials required
atomize generate template:backend-api --platform mock

# Dry-run against Azure DevOps
atomize generate template:backend-api --profile work-ado

# Create tasks
atomize generate template:backend-api --profile work-ado --execute

# CI/CD execution with a report
atomize generate template:backend-api \
  --execute \
  --auto-approve \
  --output report.json
```

See [CLI Reference](./docs/Cli-Reference.md) for complete command and flag documentation.

## Documentation

- [Documentation Index](./docs/README.md) - Start here for the full docs map
- [Workflows](./docs/Workflows.md) - Task-oriented guide across VS Code, Atomize Studio, and CLI
- [VS Code Extension](./docs/VS-Code-Extension.md) - Editor behavior, commands, settings, and troubleshooting
- [Atomize Studio](./docs/Atomize-Studio.md) - Desktop app behavior reference
- [CLI Reference](./docs/Cli-Reference.md) - Complete command and flag reference
- [Template Creation](./docs/Template-Creation.md) - Create templates from the catalog, the wizard, or an AI-assisted draft
- [Schema Reference](https://atomize-docs.pages.dev/schema) - YAML fields, constraints and defaults
- [Template Reference](./docs/Template-Reference.md) - Behaviour, composition and worked examples
- [Auth Guide](./docs/Auth-Guide.md) - Credential storage, profiles, and CI/CD setup
- [Validation Modes](./docs/Validation-Modes.md) - Strict vs lenient validation
- [Common Validation Errors](./docs/Common-Validation-Errors.md) - Fix validation failures
- [Platform Guide](./docs/Platform-Guide.md) - Azure DevOps, Mock, and platform concepts

## Development

```bash
git clone https://github.com/Simao-Pereira-Gomes/atomize.git
cd atomize
bun install
bun test
```

Repository layout:

```text
packages/
  cli/               Atomize CLI
  vscode-extension/  VS Code extension
  atomize-studio/    Atomize Studio desktop app (Tauri)
  atomize-core/      Shared template/platform/composition library
  atomize-schema/    Shared Atomize YAML schema and validation
  atomize-ai/        Shared AI template-drafting client
  atomize-sidecar/   Companion process bundled with Atomize Studio
docs/                User docs, reference docs, and ADRs
examples/            Example Atomize YAML templates
```

## License

MIT
