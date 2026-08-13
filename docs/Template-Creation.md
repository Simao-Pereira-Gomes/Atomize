# Template Creation

Atomize templates define which stories match and which child tasks should be generated. This guide covers the main ways to create or customize templates.

For YAML field semantics, see [Template Reference](./Template-Reference.md). For pattern learning internals, see [Story Learner](./Story-Learner.md).

## Choose A Creation Path

| Goal | Use |
|---|---|
| Customize a known pattern | `atomize template create --from <name>` |
| Build with prompts | `atomize template create --scratch` |
| Draft from prose | `atomize template create --ai` |
| Capture existing team practice | `atomize template create --from-stories <ids>` |
| Reuse task groups across templates | `atomize template create --type mixin` |

Running `atomize template create` without flags opens an interactive mode selector.

## Start From The Catalog

This is usually the fastest path for a first team-specific template.

```bash
atomize template list
atomize template create --from backend-api
```

The wizard opens with the source template pre-filled. Review the filter, tasks, estimation, validation rules, and metadata, then save under a new name.

```bash
atomize template create --from backend-api --save-as my-backend-api
```

Built-in catalog items are good starting points. User and project-scoped templates can also be used as sources.

## Build With The Wizard

Use the wizard when you want full control without writing YAML from scratch.

```bash
atomize template create --scratch
```

The wizard walks through:

1. Basic information: name, description, author, tags
2. Filter configuration: work item types, states, tags, paths, saved queries, and custom fields
3. Task configuration: titles, descriptions, estimation, assignments, dependencies, and conditions
4. Estimation settings: rounding and minimum task points
5. Validation rules: task count and total-estimation expectations
6. Metadata: category, guidelines, and notes

After previewing the generated YAML, save it to the template catalog or cancel without writing anything.

## Author Directly In VS Code

Use `.atomize.yaml`, `.atomize.yml`, or a first-line `# atomize-yaml` marker for the full editor experience.

VS Code provides schema-backed completions, hovers, snippets, diagnostics, CodeLens actions, preview panels, and generation panels.

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

Validate and preview often:

```bash
atomize validate my-template.atomize.yaml --strict
atomize generate my-template.atomize.yaml --platform mock
```

## AI-Assisted Drafts

Use AI-assisted creation when you can describe the desired workflow but do not want to write the initial YAML.

Create a draft. Atomize starts GitHub Copilot sign-in when needed and uses your active Copilot subscription:

```bash
atomize template create --ai
```

For better project-specific output, ground the generation with Azure DevOps metadata and observed patterns:

```bash
atomize template create --ai --ground --profile work-ado
```

Use `--ground` when your project has custom fields, non-standard work item types, or team-specific task naming conventions.

Always review AI-generated templates before use:

```bash
atomize validate template:<name> --strict
atomize generate template:<name> --platform mock
```

## Learn From Existing Stories

Use Story Learner when your team already has well-structured stories with child tasks and you want to capture that pattern.

```bash
atomize template create --from-stories 123,456,789 --save-as backend-pattern
```

With multiple stories, Atomize detects common tasks, estimation patterns, outliers, tags, and possible conditional behavior. With one story, the result mirrors that story's task breakdown more directly.

See [Story Learner](./Story-Learner.md) for confidence scoring, outlier detection, normalization, and examples.

## Create Mixins

Mixins are reusable groups of tasks that templates can include through the `mixins:` field.

```bash
atomize template create --type mixin
atomize template create --type mixin --save-as security-review
```

Use mixins for task groups that appear across many templates, such as security review, documentation, accessibility, release checks, or testing standards.

To inspect a composed template:

```bash
atomize template resolve template:my-feature --validate
```

See [Template Reference - Composition](./Template-Reference.md#composition).

## Post-Creation Checklist

Before sharing a template with a team:

1. Validate strictly.
2. Preview with mock data.
3. Preview live against one known story.
4. Confirm estimation distribution.
5. Confirm custom field names with `atomize fields list --type Task`.
6. Confirm saved query references with `atomize queries list`.
7. Install project-scoped templates into the repository when they should travel with the codebase.

Useful commands:

```bash
atomize validate template:<name> --strict
atomize generate template:<name> --platform mock
atomize generate template:<name> --profile work-ado --story 123
atomize template install ./templates/my-template.atomize.yaml --scope project
```
