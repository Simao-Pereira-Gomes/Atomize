# Template Creation

Atomize templates define which stories match and which child tasks should be generated. This guide covers the main ways to create or customize templates.

For YAML field semantics, see [Template Reference](./Template-Reference.md).

## Choose A Creation Path

<!-- atomize:section creation-paths -->

| Goal | Use |
|---|---|
| Customize a known pattern | `atomize template create --from <name>` |
| Build with prompts | `atomize template create --scratch` |
| Draft from prose | `atomize template create --ai` |
| Capture existing team practice | `atomize template create --ai --reference docs/how-we-work.md` (see [Reference Documents](#reference-documents)) |
| Reuse task groups across templates | `atomize template create --type mixin` |

Running `atomize template create` without flags opens an interactive mode selector.

In VS Code, write the YAML yourself with schema support: see [Author Directly In VS Code](#author-directly-in-vs-code).<!-- atomize:feature studio --> Every path in this table is also available visually in **Atomize Studio**, Atomize's desktop app: see [Create In Atomize Studio](#create-in-atomize-studio) below.<!-- /atomize:feature -->

<!-- /atomize:section -->

## Understand The Catalog

<!-- atomize:section catalog-concepts -->

The **Catalog** is the named inventory of Templates and Mixins you use by ref, such as `template:backend-api` or `mixin:documentation`. Every Atomize tool reads it through the same Template Library, from three scopes:

| Scope | Where it lives | Shown as | Who changes it |
| --- | --- | --- | --- |
| Built-in | Ships with Atomize | `built-in` | Nobody: it's read-only |
| Personal (`--scope user`) | `~/.atomize/catalog` | `personal` | You, on this computer |
| Project (`--scope project`) | `.atomize/catalog` in the Workspace Root | `your project` | Anyone who changes the repository |

Each scope keeps Templates in a `templates` folder and Mixins in a `mixins` folder. A Template is runnable: you preview and generate with it, and it can `extends` another Template. A Mixin only contributes tasks to the Templates that list it under `mixins:`, so it can't be previewed or generated on its own. See [Composition](./Template-Reference.md#composition).

### Workspace Root

Project scope belongs to the **Workspace Root**: the nearest folder above where you're working that has a `.atomize` folder, otherwise the git repository's root, otherwise the folder itself. The `.atomize` folder in your home folder never counts, because it holds your Connection Profiles and personal Catalog.

A Workspace Root with its own `.atomize` folder has opted in to a project Catalog. There, the CLI installs and saves to project scope by default, and VS Code offers the Project Catalog first. Without that folder, they default to your personal Catalog.

### Precedence And Catalog Overrides

When two items of the same kind share a name, project scope wins over personal, and personal wins over built-in. The winner is what `template:<name>` or `mixin:<name>` resolves to, and the other item is overridden. `atomize template list` and VS Code's **Atomize: Browse Catalog** mark the winner with `⚠ overrides` and the overridden item's scope and path:

```text
  backend-api
    Backend API (Contoso)
    Standard backend API development with database integration
    ref: template:backend-api  scope: your project
    path: ~/src/contoso-app/.atomize/catalog/templates/backend-api.atomize.yaml
    ⚠ overrides: built-in at <Atomize>/catalog/templates/backend-api.atomize.yaml (read-only)
```

Override on purpose, for example to adapt a built-in Template for one project without renaming it. Give the item its own name when you want to keep both.

### Template Lineage

A Template or Mixin's `origin` field records the Catalog item it was derived from, as `template:<name>` or `mixin:<name>`. Lineage is informational: it never changes how refs resolve, and the derived item doesn't override its origin. Lists show it as `↖ based on`:

```text
  mobile-feature
    Mobile Feature
    Feature breakdown with device testing
    ref: template:mobile-feature  scope: your project
    path: ~/src/contoso-app/.atomize/catalog/templates/mobile-feature.atomize.yaml
    ↖ based on: built-in template:feature-development
```

A flat copy from `atomize template create --from`, `atomize template improve --save-as`, and VS Code's **Save Improvement as New Template** record `origin` for you.<!-- atomize:feature studio --> So does Studio's Catalog Clone.<!-- /atomize:feature -->

<!-- /atomize:section -->

## Start From The Catalog

<!-- atomize:section creation-manual -->

This is usually the fastest path for a first team-specific template.

```bash
atomize template list
atomize template create --from backend-api
```

Atomize asks how to use the source:

- **Inheritance link** saves a small Template with `extends: "template:backend-api"`, your name and description, and any Mixins you choose. It picks up later changes to the source each time it's resolved.
- **Flat copy** saves every field, so the Template is self-contained. You can customize it in the wizard first. It records the source as its [`origin`](#template-lineage), but no longer changes when the source does.

```bash
atomize template create --from backend-api --save-as my-backend-api
```

Built-in Templates and Mixins are examples of task breakdowns and Atomize features, rather than recommended team processes. Copy one and adapt its Work Item types, tasks, dependencies, conditions, and estimates. Activities, assignment choices, validation limits, and estimates are illustrative. Match activity names and Work Item types to your project. Mixin percentages add to the consuming Template, so rebalance the combined total and any validation limits.

| Built-in Template | Demonstrates |
| --- | --- |
| `feature-development` | Percentage estimates, dependencies, activities, parent-assignee and unassigned tokens, and percentage-total validation |
| `bug-fix` | Fixed Task Estimates independent of the Story Estimate, and Task Estimate range validation |
| `agile-story-breakdown` | Conditional tasks and percentages, with a commented saved-query selection alternative |
| `backend-api` | Factor conversion before percentage distribution and rounding, with a commented non-linear table alternative |

The schema supports `strategy: percentage`; fixed Task Estimates use `estimationFixed` on individual tasks. Conversion factors and tables translate the Story Estimate before its percentage distribution. Replace the saved-query path before enabling that alternative.

Personal and project-scoped templates can also be used as sources.

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

<!-- /atomize:section -->

## Create In Atomize Studio

<!-- atomize:section creation-studio -->

[Atomize Studio](./Atomize-Studio.md) is Atomize's standalone desktop app: the visual counterpart to the CLI wizard and VS Code authoring. Its Templates Area offers four **Starting Paths** into the same authoring surface:

| Starting Path | Equivalent to | Detaches into a new template? |
|---|---|---|
| Scratch | `atomize template create --scratch` | Yes |
| Catalog Clone | `atomize template create --from <name>` | Yes |
| Open | Authoring a local Atomize YAML File directly | No: see below |
| AI draft | `atomize template create --ai` | Yes |

**Scratch**, **Catalog Clone**, and **AI draft** always produce a detached, new template: same as their CLI equivalents. **Catalog Clone** materializes the selected catalog template's fully resolved form (inheritance and mixins already applied, so the clone no longer declares `extends`/`mixins`) into the authoring surface, and records where it came from for later comparison (see Template Diff in the [Atomize Studio reference](./Atomize-Studio.md)).

**Open** is the one exception: it loads an existing local Atomize YAML File, and saving continues that same file's identity rather than detaching into a new template: closer to editing a file directly in VS Code than to the other three Starting Paths. A file that declares `extends` or `mixins` is resolved into its composed form before loading, and those fields are stripped once resolved (re-declaring them after Studio's already-flattened composition would duplicate the contributed tasks the next time the file is opened).

In Studio's task editor, the **Copies** field sets a task's `repeat`; the **Validation** section's **Maximum copies per task** sets `validation.maxRepeat`.

For the full breakdown of Studio's authoring surface, Grounded Field Options, and how it authenticates AI drafts, see the [Atomize Studio reference](./Atomize-Studio.md).

<!-- /atomize:section -->

## AI-Assisted Drafts

<!-- atomize:section creation-ai -->

Use AI-assisted creation when you can describe the desired workflow but do not want to write the initial YAML. This section covers the CLI. The VS Code extension offers the same as [Atomize: Draft Template with AI](./VS-Code-Extension.md#atomize-draft-template-with-ai)<!-- atomize:feature studio -->, and Atomize Studio as its [AI draft](./Atomize-Studio.md#ai-drafting) Starting Path<!-- /atomize:feature -->.

Create a draft. Atomize starts GitHub Copilot sign-in when needed and uses your active Copilot subscription: see [Auth Guide](./Auth-Guide.md#ai-drafting-copilot-session) for how this Copilot sign-in works and how it differs from a saved connection profile:

```bash
atomize template create --ai
```

For better project-specific output, ground the draft in your Azure DevOps project:

```bash
atomize template create --ai --ground --profile work-ado
```

With `--ground`, Atomize reads the project's work item types and states, field reference names and allowed values, saved queries, and area and iteration paths through the Connection Profile, and tells Copilot to use only those names instead of inventing its own. The profile's token is used only to read that metadata and is never sent to Copilot. Use `--ground` when your project has custom fields, non-standard work item types, or saved queries you want the Template to use.

If Atomize can't load the metadata, for example because the token has expired, it asks whether to retry, continue without project metadata, or cancel. It never drops the grounding you asked for without telling you. When you choose AI drafting from the `atomize template create` menu instead of passing `--ai`, Atomize asks whether to ground the draft. A non-interactive run stops with an error instead of drafting without the grounding you asked for.

### Reference Documents

If your team writes down how it breaks down and estimates work, for example a `docs/how-we-work.md` in the repo, give it to Copilot as a **Reference Document**. Drafts and improvements then follow your written process:

```bash
atomize template create --ai --reference docs/how-we-work.md
atomize template improve template:backend-api --reference docs/sizing.md --reference docs/definition-of-done.md
```

Reference Documents must be Markdown (`.md`) or text (`.txt`) files inside your workspace. Atomize refuses anything else, including files reached through a link that points outside the workspace. They need no Connection Profile. Copilot treats them as reference material about your process, never as instructions.

If your process lives in an **Azure DevOps wiki**, use a page from it instead:

```bash
atomize template create --ai --reference "wiki:Team.wiki/Process/How we work" --profile work-ado
```

Atomize reads that page's Markdown through the Connection Profile, and only that page: no sub-pages, no pages it links to, and no images or attachments. In an interactive run, choose **Add an Azure DevOps wiki page…**, pick the wiki, then filter its page paths and pick the pages you want. Reading wikis needs the optional **Wiki (Read)** token scope. Without it, Atomize asks you to rotate the token with that scope added, and local files keep working.

To share documents with your whole team, save them as **Project Reference Documents** in `.atomize/ai.yaml` and commit it:

```yaml
referenceDocuments:
  - file:docs/how-we-work.md
  - file:docs/sizing.md
```

Wiki pages are saved the same way, as `wiki:<wiki>/<page path>` entries. Every AI run lists them ticked, so you can leave any out of a single run, and `--no-project-references` leaves them all out. A saved wiki page is used only when the run's Connection Profile reaches that wiki's project; otherwise it's reported as unavailable for that profile and left out, so one `ai.yaml` works whichever profile a teammate uses. In an interactive run you can add a local file and choose **Also save for this project** to write it to `ai.yaml` for you. A saved document that can't be read is reported and left out. A document you named with `--reference` that can't be read stops the run.

All Reference Documents together are limited to about 24,000 characters, split evenly between them. Space a short document doesn't use goes to the others. If a document has to be shortened, Atomize tells you before anything is sent: an interactive run lets you continue, leave documents out, or cancel. A non-interactive run prints a warning, and `template improve --output` records it.

### Review The Draft

After the grounding and Reference Documents, Atomize asks you to describe the Template, then writes the draft with Copilot. It checks the draft against the Template schema and asks Copilot to fix any problems, up to three attempts.

When you ask for several identical Tasks, such as "one review task per developer, 4 developers", the draft uses a single [repeated task](./Template-Reference.md#repeated-tasks) instead of four copies.

Atomize shows a preview of the draft and asks what to do next:

- **Save template** saves it to the Catalog.
- **View full YAML** prints the draft, then asks again.
- **Edit template (opens wizard)** opens the draft in the interactive wizard.
- **Regenerate** starts the draft again from the beginning.
- **Cancel** discards the draft.

If the draft still has problems after three attempts, Atomize lists them with Copilot's raw output. Choose **Edit manually (opens wizard)** to continue in the wizard from what Copilot produced, or **Cancel**.

To improve an existing Template rather than start a new one, use [`atomize template improve`](./Cli-Reference.md#template-improve).

Always review AI-generated templates before use:

```bash
atomize validate template:<name> --strict
atomize generate template:<name> --platform mock
```

<!-- /atomize:section -->

## Create Mixins

<!-- atomize:section creation-mixins -->

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

<!-- /atomize:section -->

## Manage The Catalog

<!-- atomize:section catalog-manage -->

### Install Templates And Mixins

Installing copies an Atomize YAML File into your personal or project Catalog, so you can use it by name. Your source file stays where it is. Atomize detects whether the file is a Template or a Mixin from its root keys.

```bash
# Install into the default scope (project when the Workspace Root has its own .atomize folder)
atomize template install ./templates/mobile-feature.atomize.yaml

# Choose the scope, or install a file published at an HTTPS URL
atomize template install ./templates/release-checks.atomize.yaml --scope user
atomize template install https://example.com/templates/security-review.yaml --scope project
```

In VS Code, run **Atomize: Install to Catalog** from the CodeLens on a Template, or from the Command Palette for a Mixin.<!-- atomize:feature studio --> In Studio, use **Catalog Install** from the Templates area's Review step.<!-- /atomize:feature --> VS Code asks before it overwrites an item with the same name, and the CLI refuses unless you pass `--overwrite`.

### Update An Installed Item

A Catalog item is a copy, so changing your source file doesn't change it. To update it, either:

- install the changed source again: `atomize template install <file> --overwrite`, or **Atomize: Install to Catalog** again in VS Code; or
- edit the installed file itself, at the path `atomize template list` shows. Personal and project items are ordinary Atomize YAML Files; built-in items are read-only.

Templates that `extends` the item, and Templates that list a Mixin, use the new content the next time they're resolved. A flat copy keeps its own content and only records where it came from.

### Remove Items

`atomize template remove` deletes a personal Catalog item:

```bash
atomize template remove template:my-api-template
atomize template remove mixin:security-tasks --force
```

Built-in items can't be removed. Project items are files in the repository, so the command refuses them:

```text
Cannot remove "mobile-feature": it is a project template and is not user-installed.
```

Delete a project item's file through your team's usual review instead. Removing an item that wins a [Catalog Override](#precedence-and-catalog-overrides) makes the overridden item active again.<!-- atomize:feature studio --> Studio's **Catalog Remove** also removes personal items only.<!-- /atomize:feature -->

### Move Legacy Catalog Folders

Earlier versions kept Catalog items in `.atomize/templates`. Atomize still reads that folder, and `atomize template migrate` moves its items into `.atomize/catalog`:

```bash
atomize template migrate --dry-run
atomize template migrate --scope all --cleanup-dirs
```

Items whose names already exist in the current Catalog are skipped and reported.

<!-- /atomize:section -->

## Share Templates With Your Team

<!-- atomize:section catalog-team -->

Keep the task breakdowns your team agrees on in the repository, next to the code they describe, and change them the way you change code.

1. **Opt the repository in.** Create a `.atomize` folder at the repository root. It marks the Workspace Root and makes project scope the default for installing and saving.
2. **Install the shared items.** Run `atomize template install <file>` from the repository, or choose **Project Catalog** in VS Code's **Atomize: Install to Catalog**. Items land in `.atomize/catalog`.
3. **Commit `.atomize/catalog`.** Everyone working in the repository can then use `template:<name>` and `mixin:<name>` from any Atomize tool. Commit `.atomize/ai.yaml` too if you share [Project Reference Documents](#reference-documents).
4. **Review changes like code.** Propose a new or changed Template in a pull request, and run the [checklist](#post-creation-checklist) before merging.
5. **Evolve without copying.** Put task groups that several Templates share in a Mixin, and build variants with `extends`, so one change reaches every Template that uses it. To adapt a built-in Template, extend it to stay in sync with updates, or [override it by name](#precedence-and-catalog-overrides).

To share outside one repository, publish the file at an HTTPS URL and install it with `atomize template install <url>`. Installing copies it, so publish and install again when it changes.

<!-- /atomize:section -->

## Post-Creation Checklist

<!-- atomize:section creation-checklist -->

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

<!-- /atomize:section -->
