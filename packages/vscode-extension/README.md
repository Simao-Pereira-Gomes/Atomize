# Atomize for VS Code

Preview and generate repeatable task breakdowns from reusable YAML templates inside VS Code.

Atomize helps teams turn stories into consistent child tasks. Author Atomize YAML files with schema completions, validate them, preview the task plan, and generate tasks only after an explicit confirmation step.

> Compatibility: Atomize is designed around platform adapters. Today, connected generation supports Azure DevOps. Mock is available for offline testing.

## Requirements

Atomize for VS Code uses the Atomize CLI for validation, preview, profile management, and generation.

Install the CLI:

```bash
npm install -g @sppg2001/atomize
```

By default, the extension runs the `atomize` executable on your `PATH`. You can change this with the `atomize.cliPath` setting. If the CLI is missing or outdated, the extension can run its configured install/update command in a visible terminal.

The extension also recommends the Red Hat YAML extension for schema-backed hovers and completions.

## First Workflow

1. Install the Atomize CLI.
2. Open or create an Atomize YAML file.
3. Run **Atomize: Validate** to check the template.
4. Run **Atomize: Preview (Mock)** to simulate generated tasks without connecting to a platform.
5. Configure a Connection Profile with **Atomize: Manage Profiles** when you are ready to use connected workflows.
6. Run **Atomize: Preview (Live)** to preview against a real Story.
7. Run **Atomize: Generate** to review the plan and create Tasks only after confirmation.

Atomize previews by default. Creating Tasks requires the Generate flow and an explicit confirmation.

## Atomize YAML

Use `.atomize.yaml` or `.atomize.yml` for the full editor experience: CodeLens actions, save-time diagnostics, schema hovers, completions, and snippets.

You can also add `# atomize-yaml` on the first line of a regular YAML file. The extension may identify matching YAML content during a session, but a durable marker is recommended for team templates.

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

## Commands

- **Atomize: Validate** checks the active Template and opens a Validation Report for explicit runs.
- **Atomize: Preview (Mock)** runs an offline Mock Preview from entered Story fields.
- **Atomize: Preview (Live)** runs a connected dry run against a real Story.
- **Atomize: Generate** previews the generation result, then creates Tasks only after confirmation.
- **Atomize: Manage Profiles** adds, tests, rotates, removes, and selects Connection Profiles.
- **Atomize: Browse Catalog** opens Templates and Mixins from the Template Library.
- **Atomize: Browse Fields** looks up platform fields for a selected Connection Profile.
- **Atomize: Browse Queries** looks up saved queries for a selected Connection Profile.
- **Atomize: Show Effective Template** opens the fully Resolved Template.
- **Atomize: Open Settings** opens extension settings.

For durable Atomize YAML files, the main file actions also appear as CodeLens commands at the top of the editor.

## Validation And Preview

**Offline Validation** checks Template structure without credentials.

**Online Validation** uses a Connection Profile to verify platform-specific fields and query references. The extension always asks which profile to use before an explicit validation run. A workspace default profile may preselect an item, but it does not run connected validation silently.

**Mock Preview** does not connect to a platform and does not create Tasks.

**Live Preview** reads a real Story through a Connection Profile and shows the generated task breakdown as a dry run. It does not create Tasks.

## Connection Profiles

Run **Atomize: Manage Profiles** to add, test, rotate, remove, or set a default Connection Profile.

Profiles are owned by the Atomize CLI. The extension asks the CLI for profile state and does not store credentials itself.

For credential scopes and platform-specific setup, see the [Auth Guide](https://github.com/Simao-Pereira-Gomes/atomize/blob/main/docs/Auth-Guide.md).

## Settings

- `atomize.cliPath`: path to the Atomize CLI executable.
- `atomize.cli.installCommand`: command run in a visible terminal to install or update the default CLI.
- `atomize.cli.autoCheckUpdates`: check for stable CLI updates when using the default CLI executable.
- `atomize.defaultProfile`: workspace-scoped profile name to preselect in Validate, Live Preview, and Generate pickers.
- `atomize.previewLayout`: preview panel layout, either `default` or `compact`.

## Documentation

- [VS Code Extension Guide](https://github.com/Simao-Pereira-Gomes/atomize/blob/main/docs/VS-Code-Extension.md)
- [Documentation Index](https://github.com/Simao-Pereira-Gomes/atomize/blob/main/docs/README.md)
- [Workflows](https://github.com/Simao-Pereira-Gomes/atomize/blob/main/docs/Workflows.md)
- [Template Creation](https://github.com/Simao-Pereira-Gomes/atomize/blob/main/docs/Template-Creation.md)
- [Template Reference](https://github.com/Simao-Pereira-Gomes/atomize/blob/main/docs/Template-Reference.md)
- [Validation Modes](https://github.com/Simao-Pereira-Gomes/atomize/blob/main/docs/Validation-Modes.md)
- [CLI Reference](https://github.com/Simao-Pereira-Gomes/atomize/blob/main/docs/Cli-Reference.md)

## Screenshots

### Author Atomize YAML

![Authoring an Atomize YAML file with CodeLens actions, schema support, and diagnostics](./images/screenshots/01-author-atomize-yaml.png)

### Validate Templates

![Offline Validation Report with grouped template errors, warnings, and suggestions](./images/screenshots/02-validation-report.png)

### Preview With Mock Data

![Mock Preview Panel showing entered story fields and the resolved task breakdown](./images/screenshots/03-mock-preview.png)

### Preview A Live Story

![Live Preview Panel showing a connected dry run against a real Story](./images/screenshots/04-live-preview.png)

### Generate After Confirmation

![Generate Panel showing the dry-run report before explicit task creation](./images/screenshots/05-generate-confirmation.png)
