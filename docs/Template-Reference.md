# Template Reference

How Atomize YAML Files behave, with composition rules and worked examples.

For field types, requirements, defaults, constraints, runtime rules and deprecations,
use the [Schema Reference](https://atomize-cd9.pages.dev/schema). It has separate
[Template](https://atomize-cd9.pages.dev/schema#template.name) and
[Mixin](https://atomize-cd9.pages.dev/schema#mixin.name) entries. The public page
documents `main`; the Schema Reference inside Studio and VS Code matches the installed version.

## Table of Contents

- [File Naming](#file-naming)
- [Overview](#overview)
- [File Identity](#file-identity)
- [Composition](#composition)
- [filter](#filter)
- [tasks](#tasks)
  - [Variable Interpolation](#variable-interpolation)
  - [Assignment Patterns](#assignment-patterns)
  - [Task Custom Fields](#task-custom-fields)
  - [Conditional Tasks](#conditional-tasks)
  - [Conditional Estimation](#conditional-estimation)
  - [Task Dependencies](#task-dependencies)
  - [Repeated Tasks](#repeated-tasks)
- [estimation](#estimation)
- [validation](#validation)
- [metadata](#metadata)
- [Deprecated Fields](#deprecated-fields)
- [Complete Example](#complete-example)

---

## File Naming

The VS Code extension identifies Atomize files to enable schema autocomplete, CodeLens, snippets, and diagnostics. There are two ways to opt a file in:

### Option 1 — `.atomize.yaml` extension (recommended)

Name your file with the `.atomize.yaml` (or `.atomize.yml`) extension:

```
my-team-feature.atomize.yaml
sprint-review.atomize.yaml
security-mixin.atomize.yaml
```

The Atomize VS Code extension recognises this extension as a durable opt-in and maps it to VS Code's YAML language service so schema hovers and autocomplete work. Templates created by the CLI wizard are stored with this extension automatically.

### Option 2 — Modeline

If you cannot rename the file (e.g. the name is constrained by another tool or convention), add `# atomize-yaml` as the very first line:

```yaml
# atomize-yaml
formatVersion: "1.0"
name: "My Template"
...
```

The modeline works for any `.yaml` or `.yml` file regardless of name. The `atm-template` and `atm-mixin` snippets insert it automatically when you scaffold a new template in VS Code.

### Content detection fallback

If a file has neither the `.atomize.yaml` extension nor the modeline, the extension will attempt to identify it by structure (Template: `tasks:` with `filter:` or `formatVersion:` at root; Mixin: `tasks:` + nested `id:`, with `formatVersion:` or no `version:`). When a file is matched this way, VS Code will show a warning offering to add the modeline or rename the file. Adopting one of the explicit conventions is always preferred — content detection is a fallback and cannot be as precise.

---

## Overview

Templates are YAML files that define how Atomize breaks down user stories into tasks. Each template specifies:

1. **Which work items to target** (via `filter`)
2. **What tasks to create** (via `tasks`)
3. **How to distribute estimations** (via `estimation`)
4. **Optional constraints** (via `validation`)
5. **Optional metadata** (via `metadata`)

---

## File Identity

A file's [Format Version](https://atomize-cd9.pages.dev/schema#template.formatVersion)
identifies the edition of the Atomize format it follows. Its
[Revision](https://atomize-cd9.pages.dev/schema#template.version) belongs to the author:
Atomize displays it without interpreting or comparing it, and a child Template does
not inherit its parent's Revision. Quote version-like strings in YAML so they remain strings.

Use the [Template field reference](https://atomize-cd9.pages.dev/schema#template.name)
for identity, author and discovery fields, or the
[Mixin reference](https://atomize-cd9.pages.dev/schema#mixin.name) when authoring a Mixin.

---

## Composition

Composition combines reusable task breakdowns into a Resolved Template. Use a base Template for the common structure and Mixins for task groups that several Templates share. The same composition rules apply wherever Atomize resolves an Atomize YAML File.

### Inheritance (`extends`)

A template that declares `extends` inherits the `filter`, `tasks`, `estimation`, `validation`, and `metadata` of its base. Fields defined in the child override the corresponding fields in the base.

```yaml
formatVersion: "1.0"
name: "Secure Backend API"
extends: "backend-api"        # inherits all tasks and filter from backend-api

tasks:
  - id: "pen-test"
    title: "Penetration Testing"
    estimationPercent: 10
    activity: "Testing"
```

The Resolved Template combines the child's `tasks` list with the base's, then re-validates the combined result. Inspect that result before generating Tasks so you can check both inherited and directly defined content.

### Mixins (`mixins`)

A mixin is a partial template — typically a group of related tasks — that can be mixed into any template. The tasks from all listed mixins are appended to the template's own task list before validation.

```yaml
formatVersion: "1.0"
name: "Feature With Release Checks"
extends: "feature"
mixins:
  - "security-review-tasks"
  - "release-checklist"
```

A Mixin file may only contain `formatVersion`, `version`, `name`, `description`, `tasks`, and
`origin`. That's also how Atomize tells a standalone file apart: a file whose root keys all belong
to that list is validated as a Mixin; any other root key (`filter`, `extends`, `estimation`, …)
makes it a Template. A file referenced from `mixins:` is always read as a Mixin, and one referenced
from `extends:` as a Template.

Templates and Mixins are both Catalog items. Make each referenced item available in the Template Library before resolving the composed Template. See [Template Creation](./Template-Creation.md) for authoring and Catalog workflows.

### Resolution order

When Atomize processes a composed template:
1. Base template (`extends`) is loaded and fully resolved first
2. Mixin task lists are appended in declaration order
3. Child template fields override the merged base
4. The final result is validated as a single flat template

The Resolved Template is the content Atomize validates and uses for Task generation. Inspecting it does not create Tasks.

### Inspect composition in your tool

Choose the workflow for the tool you use; a separate CLI installation is not required by Studio or the VS Code extension.

| Tool | Inspecting a composed Template |
| --- | --- |
| VS Code extension | Open the Atomize YAML File and run **Atomize: Show Effective Template** to see its Resolved Template. The source keeps its inheritance and Mixin declarations. See the [extension command guide](./VS-Code-Extension.md#atomize-show-effective-template). |
| Atomize Studio | **Open** a composed Template to work on the resolved, flattened content. Inherited and Mixin Tasks become directly editable; Studio does not retain the `extends` and `mixins` declarations. Saving the opened file writes that flattened form, so it no longer picks up changes from its parent or Mixins. See [Studio Open](./Atomize-Studio.md#open). |
| CLI | Use `atomize template resolve <template>` to print the Resolved Template without changing the source. See the [resolve command reference](./Cli-Reference.md#template-resolve) for options and exporting resolved YAML. |

### Compatibility

The CLI first supported `extends` and `mixins` in version 2.0.0. That historical CLI requirement is not a minimum version for Studio or the VS Code extension, which have independent versions. Use the Schema Reference inside Studio or the extension for the format supported by your installed version. When sharing with an older tool that cannot resolve composition, upgrade it or share a flattened Resolved Template instead.

---

## filter

Defines which work items this template applies to. All criteria are combined with AND logic.

```yaml
filter:
  team: "Backend Team"           # Override team from the selected profile
  workItemTypes: ["User Story", "Bug"]
  states: ["New", "Active"]
  statesExclude: ["Done", "Removed"]      # Exclude items in these states
  statesWereEver: ["In Review"]           # Items that were ever in these states
  tags:
    include: ["backend"]
    exclude: ["deprecated"]
  areaPaths: ["MyProject\\Backend"]
  areaPathsUnder: ["MyProject\\Backend"]  # Match area path and all descendants
  iterations: ["MyProject\\Sprint 23"]
  iterationsUnder: ["MyProject\\Release 2"] # Match iteration and all descendants
  assignedTo: ["user@company.com", "@Me"]
  changedAfter: "@Today-7"               # Changed in the last 7 days
  createdAfter: "@Today-30"              # Created in the last 30 days
  priority:
    min: 1
    max: 3
  excludeIfHasTasks: true
```

See the [filter field reference](https://atomize-cd9.pages.dev/schema#template.filter)
for each criterion's shape, requirements and allowed values.

### Special Values

Some filter fields accept special macro values:

| Value | Used in | Behavior |
|-------|---------|----------|
| `"@Me"` | `assignedTo` | Resolves to the currently authenticated user's email |
| `"@TeamAreas"` | `areaPaths` | Resolves to all area paths owned by the configured team |
| `"@CurrentIteration"` | `iterations` | Resolves to the team's current sprint/iteration |

### Date Filters

`changedAfter` and `createdAfter` accept either a literal date string or an `@Today` macro for relative dates.

**`@Today` macro syntax:** `@Today`, `@Today-N`, `@Today+N`

```yaml
filter:
  changedAfter: "@Today-7"     # Changed in the last 7 days
  changedAfter: "@Today-30"    # Changed in the last 30 days
  createdAfter: "@Today"       # Created today
  createdAfter: "2026-01-01"   # Created on or after a specific date
```

**Other supported macros:** `@StartOfDay`, `@StartOfWeek`, `@StartOfMonth`, `@StartOfYear` (also support `±N` offsets)

### Area Paths: exact vs. descendants

Use `areaPaths` for exact matches and `areaPathsUnder` to include all sub-areas:

```yaml
# Only items directly in "MyProject\Backend"
filter:
  areaPaths: ["MyProject\\Backend"]

# Items in "MyProject\Backend" AND any sub-area (e.g. "MyProject\Backend\API")
filter:
  areaPathsUnder: ["MyProject\\Backend"]
```

### Iterations: exact vs. descendants

Use `iterations` for exact matches and `iterationsUnder` to include all child iterations:

```yaml
# Only items in Sprint 23
filter:
  iterations: ["MyProject\\Sprint 23"]

# All sprints under Release 2 (e.g. Sprint 1, Sprint 2, ...)
filter:
  iterationsUnder: ["MyProject\\Release 2"]
```

### savedQuery

Delegate query composition entirely to an existing Azure DevOps saved query. Atomize resolves the query via the ADO Queries API, executes its WIQL, and pipes the results into the standard task-creation pipeline.

Reference by ID (most stable — unaffected by renames or moves):

```yaml
filter:
  savedQuery:
    id: "a1b2c3d4-0000-0000-0000-000000000000"
```

Reference by path (human-readable, matches the query browser hierarchy):

```yaml
filter:
  savedQuery:
    path: "Shared Queries/Teams/Backend Team/Sprint Active Stories"
```

**Rules:**

- `id` and `path` are mutually exclusive — provide exactly one.
- `id` must be a valid UUID (visible in the ADO query URL).
- Only **flat (Work Items)** queries are supported. Tree and one-hop queries are rejected at runtime with a clear error.
- `savedQuery` takes precedence over all structured filter fields (`states`, `tags`, area paths, etc.). A validator warning is emitted if both are present.
- `workItemTypes` is the exception: alongside `savedQuery` it declares **which types the query returns**. It never filters the query's results, but Atomize uses it to look up fields: the estimation `source` and condition field pickers, and Online Validation of those fields. The CLI wizard asks for it when you pick a saved query, and Studio shows it next to the saved query.

**Post-processing still applies:** `excludeIfHasTasks` still applies to the query results after resolution, and you can still cap execution with the CLI `--limit` option.

```yaml
filter:
  savedQuery:
    path: "Shared Queries/All Active Stories"
  excludeIfHasTasks: true
```

```bash
atomize generate my-template.yaml --limit 20
```

**Permission requirements:**

The PAT used by Atomize must have **Work Items (Read)** scope on the project containing the query. Only shared queries are accessible — private queries owned by another user will return a "Query not found" error even if the ID is correct.

**Permission error reference:**

| Scenario | Error |
|----------|-------|
| Query ID or path does not exist | `Query not found: "...". Verify the ID or path and that the query has been shared with your account.` |
| PAT lacks read permission | `Access denied to query "...". Ensure your PAT includes the Work Items (Read) scope.` |
| Resolved path is a folder | `"..." is a query folder, not a runnable query.` |
| Tree or one-hop query type | `Only flat (Work Items) queries are supported. "..." is a tree or one-hop query.` |

**Tip:** Use `atomize queries list` to browse available query paths and IDs without leaving the terminal.

---

## tasks

Defines the tasks to create for each matching work item. Tasks are created as child items.

```yaml
tasks:
  - id: "design"
    title: "Design: ${story.title}"
    description: "Design and planning phase"
    estimationPercent: 20
    activity: "Design"
    tags: ["design"]
    assignTo: "@ParentAssignee"
    priority: 2
    condition:
      field: "tags"
      operator: "contains"
      value: "backend"
    dependsOn: []
```

See the [Task field reference](https://atomize-cd9.pages.dev/schema#template.tasks[])
for field types, constraints, estimation options and runtime rules.

### Variable Interpolation

Use story data dynamically in task titles and descriptions:

| Variable | Description |
|----------|-------------|
| `${story.title}` | Story title |
| `${story.id}` | Story ID (e.g., `STORY-123`) |
| `${story.description}` | Story description |
| `${story.estimation}` | Story Estimate |
| `${story.tags}` | Story tags (semicolon-separated) |

**Example:**

```yaml
tasks:
  - title: "Design API: ${story.title}"
    description: |
      Design the REST API for: ${story.title}

      Story ID: ${story.id}
      Estimation: ${story.estimation} points
```

Task custom field values also support story custom-field interpolation using moustache syntax:

```yaml
tasks:
  - title: "Backend Implementation"
    customFields:
      Custom.ReleaseVersion: "{{ story.customFields['Custom.ReleaseVersion'] }}"
```

### Assignment Patterns

The `assignTo` field supports special patterns in addition to email addresses:

| Value | Behavior |
|-------|----------|
| `@ParentAssignee` | Inherit assignment from the parent story |
| `@Inherit` | Same as `@ParentAssignee` |
| `@Me` | Assign to the currently authenticated user |
| `@Unassigned` | Leave the task unassigned |
| `"user@company.com"` | Assign to a specific user by email |

```yaml
tasks:
  - title: "Implementation"
    assignTo: "@ParentAssignee"   # Inherit from story

  - title: "Code Review"
    assignTo: "lead@company.com"  # Specific person

  - title: "Testing"
    assignTo: "@Me"               # Whoever runs the command
```

### Task Custom Fields

Use `customFields` to set Azure DevOps fields when Atomize creates tasks. Keys are always ADO reference names such as `Custom.ClientTier` or `Microsoft.VSTS.Common.Priority`.

```yaml
tasks:
  - id: "backend"
    title: "Backend Implementation"
    customFields:
      Custom.ClientTier: "Enterprise"
      Custom.ReleaseVersion: "{{ story.customFields['Custom.ReleaseVersion'] }}"
      Custom.IsBillable: true
      Custom.TierRank: 3
      Custom.ReleaseDate: "@Today"
```

The [custom field reference](https://atomize-cd9.pages.dev/schema#template.tasks[].customFields)
covers reference-name syntax, supported value types and platform validation rules.

**Validation behavior:**
- `atomize validate` without `--profile` checks structure only and warns that custom fields were not verified against ADO
- `atomize validate --profile <name>` connects to ADO and validates field names, read-only status, types, and picklist values
- `atomize generate` always validates custom fields against live ADO field metadata before creating work items

Use `atomize fields list` to browse available field names and types for a project before authoring templates.

### Conditional Tasks

Tasks with a `condition` are only created when the condition evaluates to `true`. Conditions are structured objects evaluated against the parent story at generate time. When a conditional task is skipped, its estimation is redistributed to other tasks proportionally.

```yaml
tasks:
  - title: "Security Review"
    estimationPercent: 10
    condition:
      field: "tags"
      operator: "contains"
      value: "security"

  - title: "Database Migration"
    estimationPercent: 15
    condition:
      all:
        - field: "tags"
          operator: "contains"
          value: "database"
        - field: "estimation"
          operator: "gt"
          value: 5
```

See the [condition field reference](https://atomize-cd9.pages.dev/schema#template.tasks[].condition)
for simple and compound clause shapes, comparison values and supported operators.

`field: estimation` compares against the **raw Story Estimate**, before any `conversion`, read from `estimation.source` when one is set. Existing point-based conditions keep their meaning, and categories work with `equals`/`not-equals`, e.g. `{ field: estimation, operator: equals, value: L }`. A numeric operator (`gt`, `lt`, `gte`, `lte`) against a non-numeric Story Estimate such as `L` is an evaluation error: the task is skipped and the reason is reported.

**Compound clauses:**
- `{ all: [...] }` means every nested clause must match
- `{ any: [...] }` means at least one nested clause must match

**VS Code snippets:** `atm-condition` (tags), `atm-condition-field` (text fields such as `state` or `areaPath`), `atm-condition-number` (`estimation`, `priority`), `atm-condition-custom`, `atm-condition-all` and `atm-condition-any`. Each snippet offers only the operators its field supports.

```yaml
tasks:
  - title: "Enterprise Review"
    condition:
      customField: "Custom.ClientTier"
      operator: "equals"
      value: "Enterprise"
```

### Conditional Estimation

Use `estimationPercentCondition` to adapt a task's percentage based on story properties. Rules are evaluated in order; the first matching rule wins. The `estimationPercent` field serves as the fallback.

```yaml
tasks:
  - title: "Implementation"
    estimationPercent: 50       # Default/fallback
    estimationPercentCondition:
      - condition:
          field: "tags"
          operator: "contains"
          value: "critical"
        percent: 60             # Higher weight for critical stories
      - condition:
          field: "estimation"
          operator: "gte"
          value: 13
        percent: 55             # More work for large stories
      - condition:
          field: "tags"
          operator: "contains"
          value: "fullstack"
        percent: 40             # Less backend work for fullstack stories
```

**Key behaviors:**
- Rules are evaluated in order; first match wins
- If no condition matches, `estimationPercent` is used
- Normalization uses the resolved percentages (including skipped tasks)
- Conditional percentages participate correctly in the 100% distribution

### Task Dependencies

Define execution order by referencing other task IDs in `dependsOn`. Atomize creates dependency links between tasks in the platform.

```yaml
tasks:
  - id: "design"
    title: "Design API"
    estimationPercent: 15

  - id: "implement"
    title: "Implement API"
    estimationPercent: 50
    dependsOn: ["design"]      # Cannot start until "design" is done

  - id: "test"
    title: "Write Tests"
    estimationPercent: 25
    dependsOn: ["implement"]

  - id: "review"
    title: "Code Review & Documentation"
    estimationPercent: 10
    dependsOn: ["implement", "test"]  # Multiple dependencies
```

**Rules:**
- `id` is required on any task that other tasks depend on
- Give a task that uses `dependsOn` its own `id`; a missing ID produces a warning
- Circular dependencies are a validation error
- IDs must be unique within a template
- A [repeated task](#repeated-tasks) can't use `dependsOn`, and no task can depend on one

### Repeated Tasks

Set `repeat` to create several identical Tasks from one task definition, for example one review Task per developer. You don't have to copy the task block and keep the copies in sync.

```yaml
tasks:
  - id: "implement"
    title: "Implement: ${story.title}"
    estimationPercent: 60

  - title: "Add review conclusions"
    estimationPercent: 10
    repeat: 4                  # creates 4 Tasks
```

Each copy's title ends with its position, so the Story above gets "Add review conclusions (1)" to "Add review conclusions (4)". With `repeat` unset or `1`, the task creates one Task and its title is unchanged.

How a repeated task behaves:

- **Every copy is identical.** All copies share the same description, tags, activity, assignee and custom fields. Write separate tasks when copies need to differ.
- **Each copy gets the full percentage.** Four copies at 10% take 40% of the Story Estimate together. The template above sums to 60% + 4 × 10% = 100%.
- **A condition applies to all copies.** The task's `condition` is checked once against the Story, so either every copy is created or none is.
- **Validation counts copies.** `totalEstimationMustBe`, `totalEstimationRange`, `minTasks` and `maxTasks` count each copy, so they describe what generation produces. `requiredTasks` still matches the task's own title, without the position suffix.
- **Previews show every copy.** Mock Preview, Live Preview and a dry run list each copy with its title and estimate.

Rules:

- `repeat` is a whole number of at least 1.
- A repeated task can't use `dependsOn`, and no task can list a repeated task in its `dependsOn`. A dependency links two single Work Items, and the copies have no single Work Item to link.
- `repeat` can be at most 20, which guards against a typo creating many Tasks on a live platform. A template that genuinely needs more raises its own limit with [`validation.maxRepeat`](https://atomize-cd9.pages.dev/schema#template.validation.maxRepeat).

The count is a fixed number written in the template. It can't come from a Story field and can't be set at generate time.

**Authoring:**
- **CLI wizard:** the advanced task options ask how many identical Tasks to create.
- **Atomize Studio:** use the task's **Copies** field.
- **VS Code:** type `atm-task-repeat`.
- **AI drafts:** a request such as "one review task per developer" produces a repeated task.

The full decision record is [ADR-0067](./adr/0067-task-repeat-count-is-a-schema-field.md).

---

## estimation

Translates the Story Estimate into the Task's unit, then distributes it across Tasks.

```yaml
estimation:
  strategy: "percentage"      # How to calculate task points
  source: "Custom.TShirtSize" # Optional: Story field holding the Story Estimate
  conversion:                 # Optional: Story unit → Task unit (omit for one-to-one)
    table: { S: 2, M: 4, L: 5, XL: 13 }   # or `factor: 4` for 1 point = 4 hours
  rounding: "nearest"         # How to round calculated values
  minimumTaskEstimate: 0.5    # Minimum Task Estimate, in the Task's unit
  ifParentHasNoEstimation: "use-default"   # warn (default) | skip | use-default
  defaultParentEstimation: "M"  # Story Estimate to assume when the real one is missing
```

See the [estimation field reference](https://atomize-cd9.pages.dev/schema#template.estimation) for field details, defaults and constraints.

**VS Code snippets:** type `atm-estimation-factor` or `atm-estimation-table` to insert a factor or a size-table configuration, or `atm-estimation-target` for `taskType` and `targetFields`; `atm-estimation` includes the `normalize` choice.

**Examples:** [points-to-hours](../examples/points-to-hours.atomize.yaml) (factor), [fibonacci-hours-table](../examples/fibonacci-hours-table.atomize.yaml) (numeric table), [tshirt-size-estimation](../examples/tshirt-size-estimation.atomize.yaml) (size field, fractional sizes) and [custom-fields-and-task-type](../examples/custom-fields-and-task-type.atomize.yaml) (`taskType` and `targetFields`); see the [examples README](../examples/README.md) for what each produces.

**Online Validation** (`atomize validate --profile <name>`, or Online in VS Code and Studio) checks estimation overrides against the project:
- **Errors:** `source` is missing on a filtered Story type; `taskType` does not exist; a `targetFields` entry is missing on the child type or is not numeric.
- **Warnings** (errors in strict mode): picklist values of `source` that `conversion.table` does not cover; table keys that are not allowed values (often typos); a `source` field that accepts free text or is a *suggested* picklist, because values outside the table leave Task Estimates blank; numeric operators on `estimation` when `source` holds text.

Conversion happens before percentage distribution. For example, a 5-point Story
with `factor: 4` becomes 20 hours; a Task weighted at 20% receives 4 hours before
rounding and the minimum. A fixed estimate is written as supplied and bypasses
percentage rounding and the minimum.

If a conversion table cannot resolve a Story Estimate, Atomize applies the chosen
unresolvable-estimate policy; it never guesses a size. See the
[conversion reference](https://atomize-cd9.pages.dev/schema#template.estimation.conversion)
and [rounding reference](https://atomize-cd9.pages.dev/schema#template.estimation.rounding)
for lookup and rounding rules.

---

## validation

Optional rules that validate the template before use. See [Validation Modes](./Validation-Modes.md) for details on strict vs lenient behavior.

```yaml
validation:
  mode: "lenient"             # lenient or strict
  totalEstimationMustBe: 100  # Total must equal exactly this
  totalEstimationRange:       # OR use a range instead
    min: 95
    max: 105
  minTasks: 3                 # Minimum number of tasks required
  maxTasks: 10                # Maximum number of tasks allowed
  maxRepeat: 30               # Highest repeat any task may use (default 20)
  taskEstimationRange:        # Inclusive percentage bounds per task
    min: 10
    max: 30
  requiredTasks:              # Tasks that must be present
    - title: "Code Review"
      id: "review"
```

See the [validation field reference](https://atomize-cd9.pages.dev/schema#template.validation) for field details, defaults and constraints.

Choose either an exact total or a range. If both are supplied, `totalEstimationMustBe` takes precedence and `totalEstimationRange` is ignored.

`taskEstimationRange` bounds are percentages from 0 to 100, with `min <= max`.
Validation checks final allocation percentages after normalization, including the
normalizer's percentage rounding. With `normalize: never`, percentages remain as
written. A lone 20% task normalized to 100% fails a 10–30% range; four 50% tasks
normalized to 25% each pass. Task Estimate rounding in hours or points does not
change this percentage constraint. Fixed estimates are excluded.
Each repeated copy is checked separately. Offline and Online Validation check
unconditional allocations on the Resolved Template (including inherited and Mixin
tasks). Story-dependent conditions and percentage overrides defer this check to
preview and generation, with an informational warning; the final active allocation
is checked before any Tasks are created. Violations are errors in both lenient and
strict mode. Normalization never clamps percentages to satisfy the bounds.

---

## metadata

Optional metadata to help others discover and use your template.

```yaml
metadata:
  category: "Backend"
  estimationGuidelines: "Based on typical backend API workflows for 5-13 point stories."
  notes: "Owned by the platform team."
```

See the [metadata field reference](https://atomize-cd9.pages.dev/schema#template.metadata) for field details, defaults and constraints.

---

## Deprecated Fields

Deprecated fields remain readable in format 1.0 and produce non-blocking warnings,
even in strict mode. Most offer a VS Code removal quick fix. When a field contains
author-written text, such as acceptance criteria, move that text to the suggested
replacement yourself so it is preserved. Removal requires a future file format,
as recorded in [ADR-0073](./adr/0073-format-version-revision-and-field-retirement.md).

The Schema Reference marks each deprecated field and describes its replacement:
[task fields](https://atomize-cd9.pages.dev/schema#template.tasks[].acceptanceCriteria),
[file timestamps](https://atomize-cd9.pages.dev/schema#template.created),
[metadata](https://atomize-cd9.pages.dev/schema#template.metadata.difficulty), and
[minimumTaskPoints](https://atomize-cd9.pages.dev/schema#template.estimation.minimumTaskPoints).
The last is a compatibility fallback, so it still affects estimates when
`minimumTaskEstimate` is absent.

---

## Complete Example

```yaml
formatVersion: "1.0"
name: "Backend API Development"
description: "Standard workflow for developing RESTful API endpoints"
author: "Platform Team"
tags: ["backend", "api", "rest"]

filter:
  workItemTypes: ["User Story"]
  states: ["New", "Active"]
  tags:
    include: ["backend", "api"]
    exclude: ["deprecated"]
  priority:
    min: 1
    max: 3
  excludeIfHasTasks: true

tasks:
  - id: "design"
    title: "Design API: ${story.title}"
    description: "Design REST endpoints, request/response schemas, and error handling"
    estimationPercent: 15
    activity: "Design"
    tags: ["design", "api"]
    assignTo: "@ParentAssignee"

  - id: "db-schema"
    title: "Database Schema"
    description: "Create or update database schema and migrations"
    estimationPercent: 15
    estimationPercentCondition:
      - condition:
          field: "tags"
          operator: "contains"
          value: "complex-db"
        percent: 25
    activity: "Development"
    dependsOn: ["design"]

  - id: "implement"
    title: "Implement Core Logic: ${story.title}"
    description: "Implement business logic, validation, and API endpoints"
    estimationPercent: 35
    activity: "Development"
    assignTo: "@ParentAssignee"
    dependsOn: ["design", "db-schema"]

  - id: "unit-tests"
    title: "Unit Tests"
    estimationPercent: 15
    activity: "Testing"
    dependsOn: ["implement"]

  - id: "integration-tests"
    title: "Integration Tests"
    estimationPercent: 10
    activity: "Testing"
    dependsOn: ["implement"]

  - id: "security-review"
    title: "Security Review"
    estimationPercent: 10
    activity: "Testing"
    condition:
      any:
        - field: "tags"
          operator: "contains"
          value: "security"
        - field: "tags"
          operator: "contains"
          value: "auth"
    dependsOn: ["implement"]

  - id: "review"
    title: "Code Review & Documentation"
    estimationPercent: 10
    activity: "Documentation"
    assignTo: "@Me"
    dependsOn: ["unit-tests", "integration-tests"]

estimation:
  strategy: "percentage"
  rounding: "nearest"
  minimumTaskEstimate: 0.5
  ifParentHasNoEstimation: "skip"

validation:
  mode: "strict"
  totalEstimationMustBe: 100
  minTasks: 3
  maxTasks: 10

metadata:
  category: "Backend"
  estimationGuidelines: "Works best with stories between 5-13 story points."
```

---

## See Also

- [Schema Reference](https://atomize-cd9.pages.dev/schema) - Field shapes, constraints, defaults and runtime rules
- [CLI Reference](./Cli-Reference.md) - Commands for validating, installing, and using templates
- [Validation Modes](./Validation-Modes.md) - Strict vs lenient validation explained
- [Common Validation Errors](./Common-Validation-Errors.md) - Fix validation failures
- [Template Creation](./Template-Creation.md) - Catalog, wizard, AI-assisted, and mixin workflows
- [Examples](../examples/) - Real-world template examples
