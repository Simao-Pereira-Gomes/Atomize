# VS Code Extension

Atomize for VS Code is the editor workflow for authoring, validating, previewing, and generating repeatable task breakdowns from Atomize YAML files.

The extension is designed for teams that want consistent task breakdowns across Stories. It runs Atomize directly in-process and keeps generation safe by previewing first: creating Tasks requires the Generate flow and an explicit confirmation.

> Compatibility: Atomize is designed around platform adapters. Today, connected generation supports Azure DevOps. Mock is available for offline testing.

> **No CLI required.** The extension embeds `@sppg2001/atomize-core` directly — it no longer spawns the Atomize CLI as a subprocess. If you're upgrading from an earlier version: the `atomize.cliPath`, `atomize.cli.installCommand`, and `atomize.cli.autoCheckUpdates` settings are deprecated no-ops. The extension shows a one-time notice if it finds any of them still set in your settings, and you can safely remove them.

## Install

Install the VS Code extension from the packaged extension or Marketplace release when available. No separate CLI install is needed — validation, preview, and generation all run in-process.

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

Durable opt-in enables CodeLens actions, save-time validation, diagnostics, snippets, and schema association.

Session Atomize YAML Opt-In may provide schema-backed authoring support when the extension recognizes a YAML document by structure, but it does not enable the full command surface. Prefer a durable marker for shared templates.

## Authoring Support

Atomize YAML authoring includes:

- schema hovers and completions
- snippets for common Template and Mixin structures
- save-time diagnostics for durable Atomize YAML files
- CodeLens actions for Validate, Preview, and Generate
- quick fixes for supported validation warnings

Validation runs on saved file content. If you explicitly validate a dirty document, the extension asks you to save first.

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

The extension owns its own profile storage: non-secret fields live in VS Code's `globalState`, secrets in VS Code's `SecretStorage` — independent of the CLI's `~/.atomize/connections.json`. If you already have CLI profiles, the empty state offers a one-time **Import from CLI** action that pre-fills a profile's non-secret fields from `~/.atomize/connections.json` (read-only, never written to); you re-enter the access token once. See the [Auth Guide](./Auth-Guide.md) for details.

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
| `atomize.cliPath` | Deprecated — no longer used. The extension runs Atomize in-process and no longer spawns a CLI executable. |
| `atomize.cli.installCommand` | Deprecated — no longer used. |
| `atomize.cli.autoCheckUpdates` | Deprecated — no longer used. |
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

### Deprecated CLI Settings Notice

If you see a one-time notice about `atomize.cliPath`, `atomize.cli.installCommand`, or `atomize.cli.autoCheckUpdates`, it means one of those settings is still set from an earlier version of the extension. They're no-ops now — the extension runs Atomize in-process — and can be safely removed from your settings.

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
