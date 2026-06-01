# VS Code Extension

Atomize for VS Code is the editor workflow for authoring, validating, previewing, and generating repeatable task breakdowns from Atomize YAML files.

The extension is designed for teams that want consistent task breakdowns across Stories. It works with the Atomize CLI and keeps generation safe by previewing first: creating Tasks requires the Generate flow and an explicit confirmation.

> Compatibility: Atomize is designed around platform adapters. Today, connected generation supports Azure DevOps. Mock is available for offline testing.

## Install

Install the Atomize CLI:

```bash
npm install -g @sppg2001/atomize
```

Install the VS Code extension from the packaged extension or Marketplace release when available. The extension runs the CLI configured by `atomize.cliPath`, which defaults to `atomize`.

The extension recommends the Red Hat YAML extension. Atomize YAML files stay on VS Code's YAML language service so schema hovers and completions work.

## First Workflow

1. Open or create an Atomize YAML file.
2. Run **Atomize: Validate**.
3. Run **Atomize: Preview (Mock)** to simulate a Story without platform access.
4. Run **Atomize: Manage Profiles** when connected workflows are needed.
5. Run **Atomize: Preview (Live)** to dry-run task generation against a real Story.
6. Run **Atomize: Generate** to review the plan and create Tasks after confirmation.

## Atomize YAML Opt-In

The full authoring surface is enabled for Durable Atomize YAML Opt-In files:

- `.atomize.yaml`
- `.atomize.yml`
- YAML files whose first line is `# atomize-yaml`

Durable opt-in enables CodeLens actions, save-time CLI validation, diagnostics, snippets, and schema association.

Session Atomize YAML Opt-In may provide schema-backed authoring support when the extension recognizes a YAML document by structure, but it does not enable the full command surface. Prefer a durable marker for shared templates.

## Authoring Support

Atomize YAML authoring includes:

- schema hovers and completions
- snippets for common Template and Mixin structures
- save-time diagnostics for durable Atomize YAML files
- CodeLens actions for Validate, Preview, and Generate
- quick fixes for supported validation warnings

CLI validation runs on saved file content. If you explicitly validate a dirty document, the extension asks you to save first.

## Commands

### Atomize: Validate

Validates the active Template and opens a Validation Report for explicit runs.

The picker supports:

- **Offline Validation**, which checks Template structure without a platform connection
- **Online Validation**, which uses a selected Connection Profile for checks that require platform metadata

Save-time validation is passive. It updates diagnostics without opening a panel or moving editor focus.

### Atomize: Preview (Mock)

Runs Mock Preview against entered Story fields. It does not require a Connection Profile, does not connect to a platform, and does not create Tasks.

Use this while designing a Template or checking conditional tasks and estimation distribution.

### Atomize: Preview (Live)

Runs Live Preview against a real Story through a selected Connection Profile. It reads Story data and renders the resolved task breakdown as a dry run. It does not create Tasks.

### Atomize: Generate

Runs the Generate Panel for the active Template. The panel first shows a dry-run report. Task creation requires an explicit panel action and confirmation.

Use Generate only when the previewed task plan is ready to create in the connected planning system.

### Atomize: Manage Profiles

Opens the Profile Management Surface for Connection Profiles. From VS Code, users can add, test, rotate, remove, and set a default profile.

Profiles are stored and managed by the Atomize CLI. The extension does not read credential storage directly and does not store credentials itself.

### Atomize: Browse Catalog

Browses the Template Library Catalog and opens Templates or Mixins. Built-in Catalog items open as read-only virtual documents.

### Atomize: Browse Fields

Browses platform fields for a selected Connection Profile. Use this when authoring filters, custom fields, or conditions.

### Atomize: Browse Queries

Browses saved platform queries for a selected Connection Profile.

### Atomize: Show Effective Template

Opens the Resolved Template after applying inheritance and Mixin injections. This is useful when debugging composed Templates.

### Atomize: Open Settings

Opens Atomize extension settings.

## Settings

| Setting | Purpose |
|---|---|
| `atomize.cliPath` | CLI executable path. Defaults to `atomize`. |
| `atomize.cli.installCommand` | Command run in a visible terminal to install or update the default CLI. |
| `atomize.cli.autoCheckUpdates` | Checks for stable CLI updates when using the default CLI executable. |
| `atomize.defaultProfile` | Workspace-scoped profile name to preselect in Validate, Live Preview, and Generate pickers. |
| `atomize.previewLayout` | Preview panel layout: `default` or `compact`. |

The workspace default profile only preselects a Connection Profile. The user still confirms the profile before connected commands run.

## Safety Model

Atomize previews by default.

| Surface | Connects to platform | Creates Tasks |
|---|---:|---:|
| Save-time diagnostics | No | No |
| Validate, offline | No | No |
| Validate, online | Yes | No |
| Preview (Mock) | No | No |
| Preview (Live) | Yes | No |
| Generate dry run | Yes | No |
| Generate confirmed execution | Yes | Yes |

## Template Example

```yaml
version: "1.0"
name: "Feature Breakdown"

filter:
  workItemTypes: ["Story"]

tasks:
  - title: "Design: ${story.title}"
    estimationPercent: 20
  - title: "Build: ${story.title}"
    estimationPercent: 60
  - title: "Validate: ${story.title}"
    estimationPercent: 20
```

For complete Template syntax, see the [Template Reference](./Template-Reference.md).

## Troubleshooting

### Atomize CLI Not Found

Install the CLI:

```bash
npm install -g @sppg2001/atomize
```

If the CLI is installed somewhere else, set `atomize.cliPath`.

### Connected Commands Need A Profile

Run **Atomize: Manage Profiles** to add and test a Connection Profile. For full credential setup, see the [Auth Guide](./Auth-Guide.md).

### Schema Hovers Or Completions Are Missing

Install or enable the Red Hat YAML extension. Also make sure the file has a durable Atomize YAML marker such as `.atomize.yaml`, `.atomize.yml`, or `# atomize-yaml`.

### CodeLens Actions Are Missing

CodeLens actions are shown for Durable Atomize YAML Opt-In files. Rename the file to `.atomize.yaml` or add `# atomize-yaml` on the first line.

## Related Docs

- [Workflows](./Workflows.md)
- [Template Reference](./Template-Reference.md)
- [Template Creation](./Template-Creation.md)
- [Validation Modes](./Validation-Modes.md)
- [Auth Guide](./Auth-Guide.md)
- [CLI Reference](./Cli-Reference.md)
