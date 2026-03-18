# Validation Modes

Atomize supports two validation modes that control how strictly templates are checked: **lenient** (default) and **strict**.

## Table of Contents

- [Overview](#overview)
- [Lenient Mode](#lenient-mode)
- [Strict Mode](#strict-mode)
- [Errors vs Warnings](#errors-vs-warnings)
- [How to Set the Mode](#how-to-set-the-mode)
- [When to Use Each Mode](#when-to-use-each-mode)
- [Examples](#examples)

---

## Overview

| | Lenient | Strict |
|--|---------|--------|
| **Errors** | Block template use | Block template use |
| **Warnings** | Non-blocking, shown as info | Promoted to errors, block template use |
| **Default** | Yes | No |
| **Use case** | Development, flexible templates | Production, QA gates, CI/CD |

---

## Lenient Mode

Lenient is the **default** mode. Only hard errors block a template from being used. Warnings are displayed but do not cause the validation to fail.

**Characteristics:**
- Errors → template is invalid, must be fixed
- Warnings → template is valid, but may behave unexpectedly
- Great for development and iterating on templates

**Example output (lenient):**
```
Template is valid (with warnings)

Warnings:
  ⚠ tasks[2].condition: Condition "true" might be invalid (no variables found)
     💡 Use variables like ${story.tags} or operators like CONTAINS, ==, !=

Ready to use with: atomize generate my-template.yaml
```

---

## Strict Mode

In strict mode, **all warnings are promoted to errors**. The template is invalid if any warning exists, regardless of whether errors are present.

**Characteristics:**
- Errors → template is invalid
- Warnings → also treated as errors, template is invalid
- Best for production templates and automated pipelines
- Enforces high quality and catches potential issues early

**Example output (strict):**
```
Template validation failed (strict mode)

Errors:
  ✗ tasks[2].condition: Condition "true" might be invalid (no variables found)
     Use variables like ${story.tags} or operators like CONTAINS, ==, !=

Fix the errors above and try again.
```

---

## Errors vs Warnings

Understanding which issues are hard errors and which are warnings helps you prioritize fixes.

### Always Errors (Both Modes)

These issues always block template use:

| Issue | Example Message |
|-------|----------------|
| Total ≠ configured `totalEstimationMustBe` | `Total estimation is 70%, but must be 100%` |
| Estimation outside configured `totalEstimationRange` | `Total estimation is 80%, must be 95%-105%` |
| Task count below minimum | `Template has 1 task(s), but minimum is 3` |
| Task count above maximum | `Template has 12 task(s), but maximum is 10` |
| Non-existent dependency reference | `Task depends on non-existent task ID: "setup-db"` |
| Task uses `dependsOn` but has no `id` | `Task "Create API" has dependencies but no id field` |
| Circular dependency | `Circular dependency detected: task1 -> task2 -> task1` |
| Missing required field | `Task title is required` |
| Invalid email format | `Invalid email: bad-email` |
| Wrong field type | `Expected number but received string` |
| Negative estimation | `Estimation percentage cannot be negative` |

### Warnings (Errors in Strict Mode)

These issues are warnings in lenient mode but become errors in strict mode:

| Issue | Example Message |
|-------|----------------|
| Condition with no variables | `Condition "true" might be invalid (no variables found)` |
| Total estimation not 100% (no `totalEstimationMustBe` or `totalEstimationRange` configured) | `Total estimation is 70% (expected 100%)` |
| Estimation below `taskEstimationRange.min` | `Task estimation 0.2 is below minimum 0.5` |
| Task missing recommended field | `Task "Implementation" has no activity set` |
| Template has no filter criteria | `No filter criteria configured — template will match all work items` |

---

## How to Set the Mode

### Via CLI Flags (Recommended)

Override the mode at the command line for the current run:

```bash
# Use strict mode for this validation
atomize validate my-template.yaml --strict

# Verbose output shows all details
atomize validate my-template.yaml --strict --verbose
```

### Via Template YAML

Set the default mode inside the template itself. This is useful when you want to enforce a mode for a specific template regardless of how it's called.

```yaml
validation:
  mode: "strict"    # or "lenient"
  totalEstimationMustBe: 100
  minTasks: 3
```

### Precedence

CLI flags override the template's `validation.mode` setting:

```
CLI --strict  >  template validation.mode  >  lenient (default)
```

---

## When to Use Each Mode

### Use Lenient Mode for:

- **Developing new templates** — iterate quickly without strict checks blocking you
- **Experimental or personal templates** — where flexibility matters more than rigidity
- **Templates with optional tasks** — where conditional tasks may cause warning-level issues
- **Generating tasks interactively** — the default mode is appropriate for everyday use

### Use Strict Mode for:

- **Shared team templates** — enforce quality for templates used across the team
- **CI/CD pipelines** — ensure templates meet all quality gates before merging
- **Production-critical templates** — for templates that run automatically
- **Template reviews** — catch every potential issue before releasing a template

```bash
# CI/CD example: validate all templates strictly
for template in templates/*.yaml; do
  atomize validate "$template" --strict
done
```

---

## Examples

### Template That Passes Both Modes

```yaml
version: "1.0"
name: "Bug Fix Workflow"
description: "Standard bug fix process"

filter:
  workItemTypes: ["Bug"]
  states: ["New", "Active"]
  excludeIfHasTasks: true

tasks:
  - id: "investigate"
    title: "Investigate & Reproduce Bug"
    estimationPercent: 30
    activity: "Testing"

  - id: "fix"
    title: "Implement Fix"
    estimationPercent: 40
    activity: "Development"
    dependsOn: ["investigate"]

  - id: "test"
    title: "Test & Verify Fix"
    estimationPercent: 20
    activity: "Testing"
    dependsOn: ["fix"]

  - id: "review"
    title: "Review & Deploy"
    estimationPercent: 10
    activity: "Documentation"
    dependsOn: ["test"]

validation:
  mode: "strict"
  totalEstimationMustBe: 100
  minTasks: 3
```

### Template That Passes Lenient but Fails Strict

```yaml
tasks:
  - title: "Implementation"
    estimationPercent: 70
    condition: "true"    # Warning: no story variables used

  - title: "Testing"
    estimationPercent: 30
```

**Lenient output:**
```
Template is valid (with warnings)
⚠ tasks[0].condition: Condition "true" might be invalid
```

**Strict output:**
```
Template validation failed (strict mode)
✗ tasks[0].condition: Condition "true" might be invalid
```

---

## See Also

- [Common Validation Errors](./Common-Validation-Errors.md) - Fix specific errors
- [Template Reference](./Template-Reference.md) - Full template schema
- [CLI Reference](./Cli-Reference.md) - `validate` command options
