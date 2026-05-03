# Template Reference

Complete reference for Atomize YAML template files.

## Table of Contents

- [Overview](#overview)
- [Top-Level Fields](#top-level-fields)
- [Composition](#composition)
- [filter](#filter)
- [tasks](#tasks)
  - [Task Fields](#task-fields)
  - [Variable Interpolation](#variable-interpolation)
  - [Assignment Patterns](#assignment-patterns)
  - [Task Custom Fields](#task-custom-fields)
  - [Conditional Tasks](#conditional-tasks)
  - [Conditional Estimation](#conditional-estimation)
  - [Task Dependencies](#task-dependencies)
- [estimation](#estimation)
- [validation](#validation)
- [metadata](#metadata)
- [Complete Example](#complete-example)

---

## Overview

Templates are YAML files that define how Atomize breaks down user stories into tasks. Each template specifies:

1. **Which work items to target** (via `filter`)
2. **What tasks to create** (via `tasks`)
3. **How to distribute estimations** (via `estimation`)
4. **Optional constraints** (via `validation`)
5. **Optional metadata** (via `metadata`)

---

## Top-Level Fields

```yaml
version: "1.0"          # Required. Always "1.0"
name: "Template Name"   # Required. Human-readable name (max 200 chars)
description: "..."      # Optional. What this template is for (max 500 chars)
author: "Your Name"     # Optional. Author name or team
tags: ["tag1", "tag2"]  # Optional. Categorization tags
extends: "backend-api"  # Optional. Inherit from a catalog template
mixins:                 # Optional. Mix in reusable task groups
  - "security-review-tasks"
  - "release-checklist"
```

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `version` | Yes | string | Template schema version. Use `"1.0"` |
| `name` | Yes | string | Template display name |
| `description` | No | string | Detailed description |
| `author` | No | string | Author name or team |
| `tags` | No | string[] | Tags for categorization |
| `extends` | No | string | Catalog template name or file path to inherit from |
| `mixins` | No | string[] | Catalog mixin names or file paths to merge into this template |

---

## Composition

Templates can inherit from other templates and mix in reusable task groups. This lets you build a library of building blocks and assemble them without duplication.

### Inheritance (`extends`)

A template that declares `extends` inherits the `filter`, `tasks`, `estimation`, `validation`, and `metadata` of its base. Fields defined in the child override the corresponding fields in the base.

```yaml
version: "1.0"
name: "Secure Backend API"
extends: "backend-api"        # inherits all tasks and filter from backend-api

tasks:
  - id: "pen-test"
    title: "Penetration Testing"
    estimationPercent: 10
    activity: "Testing"
```

The resolved template merges the child's `tasks` list on top of the base's, then re-validates the combined result. Use `atomize template resolve` to see the merged output before using it.

### Mixins (`mixins`)

A mixin is a partial template — typically a group of related tasks — that can be mixed into any template. The tasks from all listed mixins are appended to the template's own task list before validation.

```yaml
version: "1.0"
name: "Feature With Release Checks"
extends: "feature"
mixins:
  - "security-review-tasks"
  - "release-checklist"
```

Mixins are installed and managed with the `template` commands:

```bash
# Install a mixin from a URL
atomize template install https://example.com/mixins/security-tasks.yaml

# List available mixins
atomize template list --type mixin

# Create a new mixin
atomize template create --type mixin --save-as security-review-tasks
```

### Resolution order

When Atomize processes a composed template:
1. Base template (`extends`) is loaded and fully resolved first
2. Mixin task lists are appended in declaration order
3. Child template fields override the merged base
4. The final result is validated as a single flat template

Use `atomize template resolve <template>` to inspect the final merged YAML at any point.

### Compatibility

Templates using `extends` or `mixins` require Atomize v2.0.0 or later. Older versions will reject them with a schema error. If you share composed templates with users on older versions, they must upgrade first or you can share the resolved output from `atomize template resolve --quiet > resolved.yaml`.

---

## filter

Defines which work items this template applies to. All criteria are combined with AND logic.

```yaml
filter:
  team: "Backend Team"           # Override team (replaces AZURE_DEVOPS_TEAM env var)
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

### Filter Fields

| Field | Type | Description |
|-------|------|-------------|
| `team` | string | Override the team for this template (replaces `AZURE_DEVOPS_TEAM` env var) |
| `workItemTypes` | string[] | Work item types to match (e.g., `"User Story"`, `"Bug"`) |
| `states` | string[] | Work item states to include (e.g., `"New"`, `"Active"`) |
| `statesExclude` | string[] | Work item states to exclude (e.g., `"Done"`, `"Removed"`) |
| `statesWereEver` | string[] | Match items that were ever in these states |
| `tags.include` | string[] | Must have at least one of these tags |
| `tags.exclude` | string[] | Must not have any of these tags |
| `areaPaths` | string[] | Area paths to match exactly (case-sensitive). Use `"@TeamAreas"` for the team's areas |
| `areaPathsUnder` | string[] | Area paths — matches the path and all descendants (UNDER query) |
| `iterations` | string[] | Iteration paths to match. Use `"@CurrentIteration"` for the team's current sprint |
| `iterationsUnder` | string[] | Iteration paths — matches the iteration and all descendants (UNDER query) |
| `assignedTo` | string[] | Assigned user emails, or `"@Me"` for the current user |
| `changedAfter` | string | Only match items changed on or after this date. Supports `@Today` macros |
| `createdAfter` | string | Only match items created on or after this date. Supports `@Today` macros |
| `priority.min` | number | Minimum priority (1 = highest) |
| `priority.max` | number | Maximum priority |
| `excludeIfHasTasks` | boolean | Skip work items that already have child tasks |

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
- `savedQuery` takes precedence over all structured filter fields (`workItemTypes`, `states`, `tags`, etc.). A validator warning is emitted if both are present.

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
    acceptanceCriteria:
      - "Criteria 1"
      - "Criteria 2"
  ```

### Task Fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `title` | Yes | string | Task title (max 500 chars). Supports variable interpolation |
| `id` | No | string | Unique identifier for dependencies (max 30 chars) |
| `description` | No | string | Task description (max 2000 chars) |
| `estimationPercent` | No | number | Percentage of parent story points (0-100) |
| `estimationFixed` | No | number | Fixed point value regardless of parent estimation |
| `estimationPercentCondition` | No | array | Conditional estimation rules (see below) |
| `activity` | No | string | Activity type (e.g., `"Development"`, `"Testing"`, `"Design"`) |
| `tags` | No | string[] | Tags to apply to the task |
| `assignTo` | No | string | Who to assign the task to (see assignment patterns) |
| `priority` | No | number | Task priority (1-4) |
| `condition` | No | object | Structured condition to conditionally create this task |
| `dependsOn` | No | string[] | IDs of tasks this task depends on |
| `acceptanceCriteria` | No | string[] | List of acceptance criteria |
| `customFields` | No | object | Task-level Azure DevOps field values keyed by reference name |

### Variable Interpolation

Use story data dynamically in task titles and descriptions:

| Variable | Description |
|----------|-------------|
| `${story.title}` | Story title |
| `${story.id}` | Story ID (e.g., `STORY-123`) |
| `${story.description}` | Story description |
| `${story.estimation}` | Story points |
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

**Supported value types:**

| ADO field type | Template value type | Notes |
|----------------|---------------------|-------|
| Text (single line) | string | Free-form string |
| Text (multi-line) | string | Multi-line values are allowed |
| Boolean | boolean | `true` or `false` |
| Date/Time | string | ISO 8601 date/time or supported macros such as `@Today` |
| Decimal | number | Floating-point values |
| Identity | string | Email address or values such as `@Me` when supported by ADO |
| Integer | number | Whole-number values |
| Picklist (String) | string | Must match one of the allowed values |
| Picklist (Integer) | number | Must match one of the allowed values |

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

**Simple clause fields:**

| Property | Description |
|----------|-------------|
| `field` | Built-in story field such as `title`, `tags`, or `estimation` |
| `customField` | Parent story custom field reference name such as `Custom.ClientTier` |
| `operator` | One of `equals`, `not-equals`, `contains`, `not-contains`, `gt`, `lt`, `gte`, `lte` |
| `value` | String, number, or boolean to compare against |

**Compound clauses:**
- `{ all: [...] }` means every nested clause must match
- `{ any: [...] }` means at least one nested clause must match

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
- `id` is required on any task that uses `dependsOn`
- Circular dependencies are a validation error
- IDs must be unique within a template

---

## estimation

Controls how story points are distributed across tasks.

```yaml
estimation:
  strategy: "percentage"      # How to calculate task points
  rounding: "nearest"         # How to round calculated values
  minimumTaskPoints: 0.5      # Minimum points per task
  ifParentHasNoEstimation: "skip"   # What to do if parent has no points
  defaultParentEstimation: 8  # Used when parent has no estimation (if not "skip")
```

| Field | Type | Default | Options | Description |
|-------|------|---------|---------|-------------|
| `strategy` | string | `"percentage"` | `"percentage"` | How to calculate task estimations |
| `rounding` | string | `"nearest"` | `nearest`, `up`, `down`, `none` | How to round decimal point values |
| `minimumTaskPoints` | number | `0` | any non-negative number | Minimum points for any task |
| `ifParentHasNoEstimation` | string | `"skip"` | `skip`, `warn`, `use-default` | Behavior when parent story has no estimation |
| `defaultParentEstimation` | number | `8` | any positive number | Fallback estimation when parent has none |

**Rounding options:**
- `nearest` - Round to nearest whole number (0.5 → 1, 0.4 → 0)
- `up` - Always round up (0.1 → 1)
- `down` - Always round down (0.9 → 0)
- `none` - Keep decimal values

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
  taskEstimationRange:        # Each task must fall in this range
    min: 0.5
    max: 8
  requiredTasks:              # Tasks that must be present
    - title: "Code Review"
      id: "review"
```

| Field | Type | Description |
|-------|------|-------------|
| `mode` | string | `"lenient"` (default) or `"strict"`. In strict mode, warnings become errors |
| `totalEstimationMustBe` | number | Total estimation percentage must equal this value |
| `totalEstimationRange` | object | Total estimation must fall within `min`-`max` range |
| `minTasks` | number | Minimum number of tasks required |
| `maxTasks` | number | Maximum number of tasks allowed |
| `taskEstimationRange` | object | Each individual task's resolved estimation must fall within this range |
| `requiredTasks` | array | Tasks that must exist (matched by `id` or `title`) |

> **Note:** `totalEstimationMustBe` and `totalEstimationRange` are mutually exclusive.

---

## metadata

Optional metadata to help others discover and use your template.

```yaml
metadata:
  category: "Backend"
  difficulty: "intermediate"        # beginner, intermediate, advanced
  recommendedFor:
    - "API development"
    - "Microservices"
  estimationGuidelines: "Based on typical backend API workflows for 5-13 point stories."
  examples:
    - "Implement user authentication endpoint"
    - "Build REST API for product catalog"
```

| Field | Type | Description |
|-------|------|-------------|
| `category` | string | Template category (e.g., `"Backend"`, `"Frontend"`) |
| `difficulty` | string | `"beginner"`, `"intermediate"`, or `"advanced"` |
| `recommendedFor` | string[] | Descriptions of when to use this template |
| `estimationGuidelines` | string | Guidance on estimation sizing for this template |
| `examples` | string[] | Example story titles this template works well for |

---

## Complete Example

```yaml
version: "1.0"
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
  minimumTaskPoints: 0.5
  ifParentHasNoEstimation: "skip"

validation:
  mode: "strict"
  totalEstimationMustBe: 100
  minTasks: 3
  maxTasks: 10

metadata:
  category: "Backend"
  difficulty: "intermediate"
  recommendedFor:
    - "REST API development"
    - "Microservice endpoints"
    - "Data service implementation"
  estimationGuidelines: "Works best with stories between 5-13 story points."
```

---

## See Also

- [CLI Reference](./Cli-Reference.md) - Commands for validating, installing, and using templates
- [Validation Modes](./Validation-Modes.md) - Strict vs lenient validation explained
- [Common Validation Errors](./Common-Validation-Errors.md) - Fix validation failures
- [Story Learner](./Story-Learner.md) - Generate templates from existing work items
- [Template Wizard Guide](./template-wizard-guide.md) - Interactive template creation
- [Examples](../examples/) - Real-world template examples
