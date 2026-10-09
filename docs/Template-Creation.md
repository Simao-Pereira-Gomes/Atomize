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

Every path in this table is also available visually in **Atomize Studio**, Atomize's desktop app — see [Create In Atomize Studio](#create-in-atomize-studio) below.

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
2. Filter configuration: work item types, states, tags, paths, saved queries, and custom fields. With a saved query, the wizard still asks which work item types the query returns. It uses them only to look up fields, not to filter.
3. Task configuration: titles, descriptions, estimation, assignments, dependencies, and conditions. The advanced options ask how many identical Tasks to create; a [repeated task](./Template-Reference.md#repeated-tasks) skips the dependency question, and if it goes over the limit of 20, the preview offers to raise `validation.maxRepeat`
4. Estimation settings: the Story field that holds the estimate, how it converts to hours (one-to-one, a factor, or a table of values such as T-shirt sizes), the task type and target fields, what to do when a Story has no usable estimate, what happens when the percentages don't add up to 100%, rounding, and the minimum Task Estimate. With a Connection Profile, field and value choices come from your project instead of typed input.
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

When a Story needs several identical Tasks, such as one review per developer, use `repeat` instead of copying the task (the `atm-task-repeat` snippet inserts one):

```yaml
tasks:
  - title: "Build: ${story.title}"
    estimationPercent: 60
  - title: "Add review conclusions"
    estimationPercent: 10
    repeat: 4        # "Add review conclusions (1)" to "(4)", 10% each
```

See [Repeated Tasks](./Template-Reference.md#repeated-tasks) and the worked example [`examples/repeated-review-tasks.atomize.yaml`](../examples/repeated-review-tasks.atomize.yaml).

Validate and preview often:

```bash
atomize validate my-template.atomize.yaml --strict
atomize generate my-template.atomize.yaml --platform mock
```

## Create In Atomize Studio

[Atomize Studio](./Atomize-Studio.md) is Atomize's standalone desktop app — the visual counterpart to the CLI wizard and VS Code authoring. Its Templates Area offers four **Starting Paths** into the same authoring surface:

| Starting Path | Equivalent to | Detaches into a new template? |
|---|---|---|
| Scratch | `atomize template create --scratch` | Yes |
| Catalog Clone | `atomize template create --from <name>` | Yes |
| Open | Authoring a local Atomize YAML File directly | No — see below |
| AI draft | `atomize template create --ai` | Yes |

**Scratch**, **Catalog Clone**, and **AI draft** always produce a detached, new template — same as their CLI equivalents. **Catalog Clone** materializes the selected catalog template's fully resolved form (inheritance and mixins already applied, so the clone no longer declares `extends`/`mixins`) into the authoring surface, and records where it came from for later comparison (see Template Diff in the [Atomize Studio reference](./Atomize-Studio.md)).

**Open** is the one exception: it loads an existing local Atomize YAML File, and saving continues that same file's identity rather than detaching into a new template — closer to editing a file directly in VS Code than to the other three Starting Paths. A file that declares `extends` or `mixins` is resolved into its composed form before loading, and those fields are stripped once resolved (re-declaring them after Studio's already-flattened composition would duplicate the contributed tasks the next time the file is opened).

In Studio's task editor, the **Copies** field sets a task's `repeat`; the **Validation** section's **Maximum copies per task** sets `validation.maxRepeat`.

For the full breakdown of Studio's authoring surface, Grounded Field Options, and how it authenticates AI drafts, see the [Atomize Studio reference](./Atomize-Studio.md).

## AI-Assisted Drafts

Use AI-assisted creation when you can describe the desired workflow but do not want to write the initial YAML. This is available both from the CLI and as the **AI draft** Starting Path in [Atomize Studio](./Atomize-Studio.md).

Create a draft. Atomize starts GitHub Copilot sign-in when needed and uses your active Copilot subscription — see [Auth Guide](./Auth-Guide.md) for how this Copilot sign-in works and how it differs from a saved connection profile:

```bash
atomize template create --ai
```

For better project-specific output, ground the draft in your Azure DevOps project:

```bash
atomize template create --ai --ground --profile work-ado
```

With `--ground`, Atomize reads the project's work item types and states, field reference names and allowed values, saved queries, and area and iteration paths through the Connection Profile, and tells Copilot to use only those names instead of inventing its own. The profile's token is used only to read that metadata and is never sent to Copilot. Use `--ground` when your project has custom fields, non-standard work item types, or saved queries you want the Template to use.

If Atomize can't load the metadata, for example because the token has expired, it asks whether to retry, continue without project metadata, or cancel. It never drops the grounding you asked for without telling you. When you choose AI drafting from the `atomize template create` menu instead of passing `--ai`, Atomize asks whether to ground the draft.

You can also give the draft **example Stories**: Stories your team already broke down well. Copilot follows the conventions they show (how Tasks are named, how estimates are split, which review or test steps you always include) while writing the Template you described:

```bash
atomize template create --ai --from-stories 1234,1240 --profile work-ado
```

`--from-stories` implies `--ground`. In an interactive run with grounding, Atomize asks whether to add example Stories. You can pick them from a list you can filter by ID or title, and narrow by area and iteration, or enter their IDs. By default only titles, states, estimates and Task activity are sent. Descriptions and acceptance criteria can contain customer, personal or internal details, so they're sent only with `--include-sensitive-ai-context`, or if you say yes when asked, and only for that run.

Atomize never picks example Stories for you. Without `--ai`, `--from-stories` keeps its original meaning: the [Story Learner](./Story-Learner.md) derives a Template from those Stories directly, without AI.

### Reference Documents

If your team writes down how it breaks down and estimates work, for example a `docs/how-we-work.md` in the repo, give it to Copilot as a **Reference Document**. Drafts and improvements then follow your written process:

```bash
atomize template create --ai --reference docs/how-we-work.md
atomize template improve template:backend-api --reference docs/sizing.md --reference docs/definition-of-done.md
```

Reference Documents must be Markdown (`.md`) or text (`.txt`) files inside your workspace. Atomize refuses anything else, including files reached through a link that points outside the workspace. They need no Connection Profile. Copilot treats them as reference material about your process, never as instructions.

To share documents with your whole team, save them as **Project Reference Documents** in `.atomize/ai.yaml` and commit it:

```yaml
referenceDocuments:
  - file:docs/how-we-work.md
  - file:docs/sizing.md
```

Every AI run lists them ticked, so you can leave any out of a single run, and `--no-project-references` leaves them all out. In an interactive run you can add a local file and choose **Also save for this project** to write it to `ai.yaml` for you. A saved document that can't be read is reported and left out. A document you named with `--reference` that can't be read stops the run.

All Reference Documents together are limited to about 24,000 characters, split evenly between them. Space a short document doesn't use goes to the others. If a document has to be shortened, Atomize tells you before anything is sent: an interactive run lets you continue, leave documents out, or cancel. A non-interactive run prints a warning, and `template improve --output` records it.

When you ask for several identical Tasks, such as "one review task per developer, 4 developers", the draft uses a single [repeated task](./Template-Reference.md#repeated-tasks) instead of four copies. Atomize Studio's AI draft path grounds the same way, through whichever connection profile is selected in its header.

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

Story Learner never infers `repeat`: identical Tasks it learns from stay separate task definitions. Merge them into one [repeated task](./Template-Reference.md#repeated-tasks) yourself if they really are interchangeable.

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
