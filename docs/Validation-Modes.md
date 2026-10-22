# Validation Modes

Atomize supports two validation modes that control how strictly templates are checked: **lenient** (default) and **strict**. Separately, Offline or Online Validation decides whether the checks that need your Azure DevOps project run at all.

## Table of Contents

- [Two Separate Choices](#two-separate-choices)
- [Offline And Online Validation](#offline-and-online-validation)
- [Run Validation In Your Tool](#run-validation-in-your-tool)
- [Overview](#overview)
- [Lenient Mode](#lenient-mode)
- [Strict Mode](#strict-mode)
- [Errors vs Warnings](#errors-vs-warnings)
- [How to Set the Mode](#how-to-set-the-mode)
- [When to Use Each Mode](#when-to-use-each-mode)
- [Examples](#examples)

---

<!-- atomize:section validation-choices -->

## Two Separate Choices

Every validation run makes two independent choices. Don't confuse them: connecting to Azure DevOps doesn't make validation stricter, and strict mode doesn't connect.

| Choice | Options | What it decides |
| --- | --- | --- |
| Where the checks run | **Offline Validation** (default) or **Online Validation** | Whether Atomize also checks the Template's references against your Azure DevOps project |
| How strict it is | **Lenient** (default) or **strict** | Whether warnings fail validation |

Errors always fail validation. In lenient mode, warnings are reported but the Template is still valid. In strict mode, every warning becomes an error.

<!-- /atomize:section -->

---

<!-- atomize:section validation-online -->

## Offline And Online Validation

**Offline Validation** checks the Template on its own: its structure and field types, task counts and estimation totals, dependencies and repetition, conditions, the estimation configuration, and its composition with any parent and Mixins. It needs no Connection Profile and finishes immediately, so every tool runs it while you author.

**Online Validation** runs those checks and also connects through a Connection Profile to check what only your project can confirm:

- custom field reference names, whether each is read-only, its type, and picklist values;
- fields named in conditions;
- the saved query in `filter.savedQuery`;
- the estimation settings: whether `estimation.source`, `taskType`, and each `targetFields` entry exist and can hold the value, and whether `conversion.table` covers the source field's allowed values.

Without a connection, those checks can't run. Offline Validation reports a warning such as `1 task(s) have custom fields that could not be verified` instead, so a strict run fails until you validate online.

Online Validation needs a Connection Profile whose token has the [Work Items scope](./Auth-Guide.md#required-permissions). If Atomize can't connect, it reports `Could not validate project references against ADO: …` as a warning and finishes the offline checks. A lenient run still passes; a strict run fails. Fix the connection with [connection troubleshooting](./Auth-Guide.md#troubleshooting) and validate again.

**Field assistance is not validation.** Field and query browsers, field suggestions in the CLI wizard<!-- atomize:feature studio -->, and Studio's Grounded Field Options<!-- /atomize:feature --> help you pick names that exist while you author. They only cover the value you're choosing. Online Validation checks every reference in the Template, including ones typed by hand or copied from another project, so run it before you share a Template or generate from it.

<!-- /atomize:section -->

---

<!-- atomize:section validation-tools -->

## Run Validation In Your Tool

**CLI.** `atomize validate` validates one Template, by file path, Catalog ref, or HTTPS URL:

```bash
atomize validate my-template.atomize.yaml            # Offline Validation, lenient unless the Template sets strict
atomize validate my-template.atomize.yaml --strict   # warnings become errors
atomize validate template:backend-api --profile work-ado   # Online Validation through a profile
atomize validate my-template.atomize.yaml --output json    # a ValidationResult object, with suggested fixes
```

In an interactive terminal, a Template that has references only Online Validation can check asks whether to validate offline or online; `--strict` selects Online first. The command exits with `0` when the Template is valid and `1` when it isn't. See [`validate`](./Cli-Reference.md#validate) for every option.

**VS Code.** Saving an Atomize YAML File runs Offline Validation and updates the Problems panel without opening anything. Run **Atomize: Validate** to choose Offline or Online Validation and open a Validation Report that lists each error and warning with its suggested fix. See [Atomize: Validate](./VS-Code-Extension.md#atomize-validate).

<!-- atomize:feature studio -->

**Atomize Studio.** Each authoring section validates as you edit, and **Review** lists whole-Template problems with the Tasks they affect. **Validate online…** in Review runs Online Validation through the selected Work Project. See [Review and export](./Atomize-Studio.md#review-and-export).

<!-- /atomize:feature -->

VS Code<!-- atomize:feature studio --> and Studio<!-- /atomize:feature --> use the Template's own `validation.mode`. To validate strictly there, set `mode: "strict"` in the Template, or run `atomize validate --strict`.

To validate several Templates in a script or CI job, run `atomize validate` once per file:

```bash
for template in templates/*.atomize.yaml; do
  atomize validate "$template" --strict || exit 1
done
```

<!-- /atomize:section -->

---

## Overview

<!-- atomize:section validation-strictness -->

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
Template is valid! [Lenient]

Warnings:
  • tasks[*].customFields: 1 task(s) have custom fields that could not be verified.
     Run with --profile <name> (or choose Online when prompted) to validate field names, types, and picklist values.

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
Template validation failed [Strict]

Errors:
  • tasks[*].customFields: 1 task(s) have custom fields that could not be verified.
     Run with --profile <name> (or choose Online when prompted) to validate field names, types, and picklist values.

Fix the errors above and try again.
```

<!-- /atomize:section -->

---

<!-- atomize:section validation-findings -->

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
| Final percentage outside `taskEstimationRange` | `Final task allocation is 50%, but must be between 10% and 30%.` |
| Inverted `taskEstimationRange` bounds | `taskEstimationRange.max must be greater than or equal to min.` |
| Invalid custom field in Online Validation | `Field "Custom.ClientTier" not found for work item type "Task"` |
| Tag condition with an operator other than `contains`/`not-contains` | `Field "tags" is multi-value; only "contains"/"not-contains" are supported (got "equals").` |
| Both or neither of `conversion.factor` and `conversion.table` | `conversion must set exactly one of factor or table` |
| `defaultParentEstimation` the conversion can't convert | `defaultParentEstimation "XXL" is not a key of conversion.table` |
| Estimation source, task type or target field missing in Online Validation | `Field "Custom.TShirtSize" not found for work item type "User Story".` |
| Target field that can't hold a Task Estimate (not numeric, or a picklist) in Online Validation | `Field "Custom.Notes" is a string field; Task Estimates can only be written to numeric fields.` |

### Warnings (Errors in Strict Mode)

These issues are warnings in lenient mode but become errors in strict mode:

| Issue | Example Message |
|-------|----------------|
| Offline custom field verification | `1 task(s) have custom fields that could not be verified` |
| Total estimation not 100% (no `totalEstimationMustBe` or `totalEstimationRange` configured) | `Total estimation is 70% (expected 100%)` |
| Task missing recommended field | `Task "Implementation" has no activity set` |
| Template has no filter criteria | `No filter criteria configured: template will match all work items` |
| Story Estimate value with no conversion (Online) | `"XXL" is a valid value of "Custom.TShirtSize" but has no conversion; Stories with it will get blank Task Estimates.` |
| `conversion.table` key that isn't an allowed value (Online) | `conversion.table key "XXS" is not an allowed value of "Custom.TShirtSize" and will never match.` |
| Free-text or open picklist source field (Online) | `"Custom.Size" is a free-text field; any value not in the conversion table will leave Tasks unestimated.` |
| Numeric condition on a text Story Estimate (Online) | `This condition compares estimation numerically, but "Custom.TShirtSize" holds text values; ...` |
| Target field that holds a ranking or value (Online) | `Field "Microsoft.VSTS.Common.BacklogPriority" holds a ranking or value, not effort; ...` |

Some warnings stay warnings in strict mode, because the Template still works as intended. One example is the deprecated `minimumTaskPoints` key, which is used as `minimumTaskEstimate`.

<!-- /atomize:section -->

---

## How to Set the Mode

<!-- atomize:section validation-setting -->

### Via CLI Flags (Recommended)

Override the mode at the command line for the current run:

```bash
# Use strict mode for this validation
atomize validate my-template.yaml --strict

# Connect to ADO for live custom-field and saved-query validation
atomize validate my-template.yaml --profile work-ado
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

When Azure DevOps-backed validation is needed:
- `atomize validate` runs Offline Validation by default and only checks structure
- `atomize validate --profile <name>` performs Online Validation against Azure DevOps: custom fields, saved queries, and the estimation settings (`estimation.source`, `taskType`, `targetFields`, and `conversion.table` against the source field's allowed values)
- In interactive terminals, Atomize may prompt you to choose Offline Validation or Online Validation

---

## When to Use Each Mode

### Use Lenient Mode for:

- **Developing new templates**: iterate quickly without strict checks blocking you
- **Experimental or personal templates**: where flexibility matters more than rigidity
- **Templates with optional tasks**: where conditional tasks may cause warning-level issues
- **Generating tasks interactively**: the default mode is appropriate for everyday use

### Use Strict Mode for:

- **Shared team templates**: enforce quality for templates used across the team
- **CI/CD pipelines**: ensure templates meet all quality gates before merging
- **Production-critical templates**: for templates that run automatically
- **Template reviews**: catch every potential issue before releasing a template

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
formatVersion: "1.0"
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
    customFields:
      Custom.ReleaseVersion: "{{ story.customFields['Custom.ReleaseVersion'] }}"

  - title: "Testing"
    estimationPercent: 30
```

**Lenient output:**
```
Template is valid! [Lenient]
Warnings:
  • tasks[*].customFields: 1 task(s) have custom fields that could not be verified.
```

**Strict output:**
```
Template validation failed [Strict]
Errors:
  • tasks[*].customFields: 1 task(s) have custom fields that could not be verified.
```

<!-- /atomize:section -->

---

## See Also

- [Common Validation Errors](./Common-Validation-Errors.md) - Fix specific errors
- [Schema Reference](https://atomize-cd9.pages.dev/schema) - YAML fields and validation constraints
- [Template Reference](./Template-Reference.md) - Behaviour and worked examples
- [CLI Reference](./Cli-Reference.md) - `validate` command options
- [Atomize Studio](./Atomize-Studio.md) - Offline and Online Validation in the desktop app
