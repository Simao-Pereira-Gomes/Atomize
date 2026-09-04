# Atomize

[![CI](https://github.com/Simao-Pereira-Gomes/atomize/actions/workflows/ci.yml/badge.svg)](https://github.com/Simao-Pereira-Gomes/atomize/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Simao-Pereira-Gomes/atomize/actions/workflows/codeql.yml/badge.svg)](https://github.com/Simao-Pereira-Gomes/atomize/actions/workflows/codeql.yml)
[![NPM Version](https://img.shields.io/npm/v/@sppg2001/atomize)](https://www.npmjs.com/package/@sppg2001/atomize)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/node/v/@sppg2001/atomize)](https://nodejs.org)

**Break down stories, build up velocity.**

Atomize turns stories into consistent child tasks using reusable YAML templates. Use it from VS Code for guided authoring, Atomize Studio for a standalone visual workflow, or the CLI for automation and scripting — pick the surface that fits, or mix them.

Atomize is designed around platform adapters. Today, connected generation supports Azure DevOps. Mock is available for offline testing.

## What You Can Do

- Author Atomize YAML with schema hovers, completions, snippets, diagnostics, and CodeLens actions in VS Code, or visually in Atomize Studio.
- Preview task breakdowns with mock story data before connecting to a real platform.
- Run live dry-runs against Azure DevOps stories before creating anything.
- Generate child tasks only after reviewing the plan and confirming execution.
- Reuse built-in, user, and project-scoped templates and mixins.
- Create templates from the catalog, from scratch, from existing stories, or from an AI-assisted draft.
- Automate validation and generation from the CLI in CI/CD.

## Start With VS Code

1. Install the [Atomize extension](./docs/VS-Code-Extension.md) from the Marketplace or a packaged release. It runs directly in the editor — no separate CLI install needed.
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

```bash
npm install -g @sppg2001/atomize
```

```bash
atomize template create --from backend-api
atomize validate template:backend-api
atomize generate template:backend-api            # dry run
atomize generate template:backend-api --execute   # create tasks after confirmation
```

Full reference: [CLI Reference](./docs/Cli-Reference.md).

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
| Capture existing team practice | `atomize template create --from-stories 123,456,789` |
| Draft from prose | `atomize template create --ai` |

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

See [Template Creation](./docs/Template-Creation.md) for creation workflows and [Template Reference](./docs/Template-Reference.md) for the full YAML schema.

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
- [Template Creation](./docs/Template-Creation.md) - Create templates from catalog, wizard, AI, or existing stories
- [Template Reference](./docs/Template-Reference.md) - Full template schema and semantics
- [Auth Guide](./docs/Auth-Guide.md) - Credential storage, profiles, and CI/CD setup
- [Validation Modes](./docs/Validation-Modes.md) - Strict vs lenient validation
- [Common Validation Errors](./docs/Common-Validation-Errors.md) - Fix validation failures
- [Platform Guide](./docs/Platform-Guide.md) - Azure DevOps, Mock, and platform concepts
- [Story Learner](./docs/Story-Learner.md) - Generate templates from existing work items

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
