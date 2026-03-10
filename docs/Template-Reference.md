# Template Reference

Complete reference for Atomize YAML template files.

## Table of Contents

- [Overview](#overview)
- [Top-Level Fields](#top-level-fields)
- [filter](#filter)
- [tasks](#tasks)
  - [Task Fields](#task-fields)
  - [Variable Interpolation](#variable-interpolation)
  - [Assignment Patterns](#assignment-patterns)
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
```

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `version` | Yes | string | Template schema version. Use `"1.0"` |
| `name` | Yes | string | Template display name |
| `description` | No | string | Detailed description |
| `author` | No | string | Author name or team |
| `tags` | No | string[] | Tags for categorization |

---

## filter

Defines which work items this template applies to. All criteria are combined with AND logic.

```yaml
filter:
  workItemTypes: ["User Story", "Bug"]
  states: ["New", "Active"]
  tags:
    include: ["backend"]
    exclude: ["deprecated"]
  areaPaths: ["MyProject\\Backend"]
  iterations: ["MyProject\\Sprint 23"]
  assignedTo: ["user@company.com", "@Me"]
  priority:
    min: 1
    max: 3
  excludeIfHasTasks: true
  customFields:
    - field: "Custom.Team"
      operator: "equals"
      value: "Platform Engineering"
  customQuery: "SELECT [System.Id] FROM WorkItems WHERE ..."
```

### Filter Fields

| Field | Type | Description |
|-------|------|-------------|
| `workItemTypes` | string[] | Work item types to match (e.g., `"User Story"`, `"Bug"`) |
| `states` | string[] | Work item states to match (e.g., `"New"`, `"Active"`) |
| `tags.include` | string[] | Must have at least one of these tags |
| `tags.exclude` | string[] | Must not have any of these tags |
| `areaPaths` | string[] | Area paths to match (case-sensitive) |
| `iterations` | string[] | Iteration paths to match |
| `assignedTo` | string[] | Assigned user emails, or `"@Me"` for current user |
| `priority.min` | number | Minimum priority (1 = highest) |
| `priority.max` | number | Maximum priority |
| `excludeIfHasTasks` | boolean | Skip work items that already have child tasks |
| `customFields` | array | Additional field filters (see below) |
| `customQuery` | string | Raw WIQL query that overrides all other filters |

### Custom Field Filters

```yaml
filter:
  customFields:
    - field: "Custom.Team"
      operator: "equals"
      value: "Platform Engineering"

    - field: "Microsoft.VSTS.Common.Priority"
      operator: "lessThan"
      value: 3
```

**Supported operators:** `equals`, `notEquals`, `contains`, `greaterThan`, `lessThan`

### Custom WIQL Query

Use `customQuery` when you need advanced filtering that standard fields cannot express. This overrides all other filter criteria.

```yaml
filter:
  customQuery: |
    SELECT [System.Id]
    FROM WorkItems
    WHERE [System.TeamProject] = 'MyProject'
      AND [System.WorkItemType] = 'User Story'
      AND [System.State] IN ('New', 'Active')
      AND [Custom.Team] = 'Platform Engineering'
      AND [Microsoft.VSTS.Common.Priority] <= 2
```

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
    condition: '${story.tags} CONTAINS "backend"'
    dependsOn: []
    acceptanceCriteria:
      - "Criteria 1"
      - "Criteria 2"
    customFields:
      Custom.Complexity: "High"
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
| `remainingWork` | No | number | Override remaining work in hours |
| `condition` | No | string | Expression to conditionally create this task |
| `dependsOn` | No | string[] | IDs of tasks this task depends on |
| `acceptanceCriteria` | No | string[] | List of acceptance criteria |
| `customFields` | No | object | Custom Azure DevOps fields to set |

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

### Conditional Tasks

Tasks with a `condition` are only created when the condition evaluates to `true`. When a conditional task is skipped, its estimation is redistributed to other tasks proportionally.

```yaml
tasks:
  - title: "Security Review"
    estimationPercent: 10
    condition: '${story.tags} CONTAINS "security"'

  - title: "Database Migration"
    estimationPercent: 15
    condition: '${story.tags} CONTAINS "database" AND ${story.estimation} > 5'
```

**Condition operators:**

| Operator | Usage | Example |
|----------|-------|---------|
| `CONTAINS` | Tag/string contains value | `${story.tags} CONTAINS "backend"` |
| `NOT CONTAINS` | Tag/string doesn't contain value | `${story.tags} NOT CONTAINS "frontend"` |
| `==` | Equality | `${story.estimation} == 8` |
| `!=` | Inequality | `${story.estimation} != 0` |
| `>` | Greater than | `${story.estimation} > 5` |
| `<` | Less than | `${story.estimation} < 13` |
| `>=` | Greater than or equal | `${story.estimation} >= 8` |
| `<=` | Less than or equal | `${story.estimation} <= 3` |
| `AND` | Both conditions must be true | `... AND ...` |
| `OR` | Either condition must be true | `... OR ...` |

### Conditional Estimation

Use `estimationPercentCondition` to adapt a task's percentage based on story properties. Rules are evaluated in order; the first matching rule wins. The `estimationPercent` field serves as the fallback.

```yaml
tasks:
  - title: "Implementation"
    estimationPercent: 50       # Default/fallback
    estimationPercentCondition:
      - condition: '${story.tags} CONTAINS "critical"'
        percent: 60             # Higher weight for critical stories
      - condition: "${story.estimation} >= 13"
        percent: 55             # More work for large stories
      - condition: '${story.tags} CONTAINS "fullstack"'
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
  customFieldDefinitions:     # Define allowed custom field values
    - name: "Complexity"
      type: "string"
      allowedValues: ["Low", "Medium", "High"]
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
| `customFieldDefinitions` | array | Definitions for custom fields used in tasks |

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
      - condition: '${story.tags} CONTAINS "complex-db"'
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
    condition: '${story.tags} CONTAINS "security" OR ${story.tags} CONTAINS "auth"'
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

- [CLI Reference](./Cli-Reference.md) - Commands for validating and using templates
- [Validation Modes](./Validation-Modes.md) - Strict vs lenient validation explained
- [Common Validation Errors](./Common-Validation-Errors.md) - Fix validation failures
- [Story Learner](./Story-Learner.md) - Generate templates from existing work items
- [Template Wizard Guide](./template-wizard-guide.md) - Interactive template creation
- [Examples](../examples/) - Real-world template examples
