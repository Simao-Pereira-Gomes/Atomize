# Common Validation Errors

This guide provides solutions for common template validation errors you might encounter when creating or editing Atomize templates.

## Table of Contents

- [Validation Modes: Lenient vs Strict](#validation-modes-lenient-vs-strict)
- [Estimation Errors](#estimation-errors)
- [Task Count Errors](#task-count-errors)
- [Dependency Errors](#dependency-errors)
- [Condition Errors](#condition-errors)
- [Schema Errors](#schema-errors)
- [Understanding Error Messages](#understanding-error-messages)

---

## Validation Modes: Lenient vs Strict

Atomize has two validation modes that affect how warnings are treated.

| Mode | Warnings | Usage |
|------|----------|-------|
| **Lenient** (default) | Non-blocking — template is still valid | Development, flexible templates |
| **Strict** | Promoted to errors — template is invalid | Production, CI/CD, team templates |

**Set mode via CLI:**
```bash
atomize validate my-template.yaml --strict    # Warnings become errors
atomize validate my-template.yaml             # Warnings are non-blocking (default)
```

**Set mode in template YAML:**
```yaml
validation:
  mode: "strict"   # or "lenient"
```

See [Validation Modes](./Validation-Modes.md) for a full explanation.

---

## Estimation Errors

### Total Estimation Does Not Equal 100%

> **Note:** Without `totalEstimationMustBe` or `totalEstimationRange` configured, a mismatched total is a **warning** (not an error) in lenient mode — the template is still usable. It only becomes an error when a strict constraint is configured, or when running in strict mode.

**Error Message** (when `totalEstimationMustBe: 100` is set):
```
Total estimation is 70%, but must be 100%.
💡 Add 30% to existing tasks or create a new task with 30% estimation.
```

**Cause:** Your task estimation percentages don't add up to 100%, and a strict validation constraint requires them to.

**Solutions:**
1. **Adjust existing tasks:**
   ```yaml
   tasks:
     - title: "Design"
       estimationPercent: 40  # Was 30
     - title: "Development"
       estimationPercent: 60  # Was 40
   ```

2. **Add a new task:**
   ```yaml
   tasks:
     - title: "Design"
       estimationPercent: 30
     - title: "Development"
       estimationPercent: 40
     - title: "Testing"      # New task
       estimationPercent: 30
   ```

### Total Estimation Exceeds 100%

**Error Message:**
```
Total estimation is 120%, but must be 100%.
💡 Reduce task estimations by 20% to reach 100%.
```

**Cause:** Your task estimation percentages exceed 100%.

**Solutions:**
1. **Reduce task percentages proportionally:**
   ```yaml
   tasks:
     - title: "Design"
       estimationPercent: 25  # Was 40
     - title: "Development"
       estimationPercent: 50  # Was 60
     - title: "Testing"
       estimationPercent: 25  # Was 20
   ```

2. **Use the wizard's auto-normalization feature:**
   ```bash
   atomize template create --scratch
   # The wizard will offer to normalize estimations automatically
   ```

### Estimation Outside Range

**Error Message:**
```
Total estimation is 80%, but must be between 95% and 105%.
💡 Increase task estimations by 15% to meet the minimum of 95%.
```

**Cause:** Total estimation falls outside the configured acceptable range.

**Solution:**
```yaml
tasks:
  - title: "Task 1"
    estimationPercent: 50  # Increase from 40
  - title: "Task 2"
    estimationPercent: 45  # Increase from 40
```

### Negative or Excessive Estimation

**Error Message:**
```
Estimation percentage cannot be negative.
💡 Estimation percentage cannot be negative. Use a value between 0 and 100.
```

**Cause:** Task has invalid estimation value (negative or > 100).

**Solution:**
```yaml
tasks:
  - title: "Task 1"
    estimationPercent: 50  # Fix: was -10 or 150
```

---

## Task Count Errors

### Too Few Tasks

**Error Message:**
```
Template has 1 task(s), but minimum is 3. Add 2 more task(s).
💡 Add 2 more task(s) to meet the minimum requirement of 3 tasks.
```

**Cause:** Template doesn't have enough tasks to meet minimum requirement.

**Solution:**
```yaml
validation:
  minTasks: 3

tasks:
  - title: "Task 1"
    estimationPercent: 33
  - title: "Task 2"      # Added
    estimationPercent: 33
  - title: "Task 3"      # Added
    estimationPercent: 34
```

### Too Many Tasks

**Error Message:**
```
Template has 5 task(s), but maximum is 3. Remove 2 task(s) or increase maxTasks.
💡 Remove 2 task(s) or increase the maxTasks limit to 5.
```

**Cause:** Template has more tasks than the maximum allowed.

**Solutions:**
1. **Remove excess tasks:**
   ```yaml
   tasks:
     - title: "Task 1"
     - title: "Task 2"
     - title: "Task 3"
     # Removed Task 4 and Task 5
   ```

2. **Increase the limit:**
   ```yaml
   validation:
     maxTasks: 5  # Increased from 3
   ```

### At Least One Task Required

**Error Message:**
```
At least one task is required
💡 Add at least one task to the template.
```

**Cause:** Template has no tasks defined.

**Solution:**
```yaml
tasks:
  - title: "Initial Task"
    description: "First task description"
    estimationPercent: 100
```

---

## Dependency Errors

### Non-Existent Task Dependency

**Error Message:**
```
Task depends on non-existent task ID: "setup-db". Available task IDs: "task1", "task2"
💡 Either add a task with id: "setup-db" or update the dependsOn field to reference an existing task ID.
```

**Cause:** A task references a dependency that doesn't exist.

**Solutions:**
1. **Fix the dependency reference:**
   ```yaml
   tasks:
     - id: "task1"
       title: "Setup Database"
       estimationPercent: 30
     - id: "task2"
       title: "Create API"
       estimationPercent: 70
       dependsOn: ["task1"]  # Fixed: was "setup-db"
   ```

2. **Add the missing task:**
   ```yaml
   tasks:
     - id: "setup-db"      # Added missing task
       title: "Setup Database"
       estimationPercent: 30
     - id: "task2"
       title: "Create API"
       estimationPercent: 70
       dependsOn: ["setup-db"]
   ```

### Task Has Dependencies But No ID

**Error Message:**
```
Task "Create API" has dependencies but no id field.
💡 Add an 'id' field to this task, e.g., 'id: "create-api"'
```

**Cause:** A task specifies dependencies but doesn't have an ID itself.

**Solution:**
```yaml
tasks:
  - id: "setup-db"
    title: "Setup Database"
    estimationPercent: 30
  - id: "create-api"     # Added missing ID
    title: "Create API"
    estimationPercent: 70
    dependsOn: ["setup-db"]
```

### Task Referenced But Has No ID

**Error Message:**
```
Task "Setup Database" is referenced by other tasks but has no id field.
💡 Add 'id: "setup-database"' to this task. Referenced by: "Create API", "Write Tests"
```

**Cause:** Other tasks depend on this task, but it doesn't have an ID.

**Solution:**
```yaml
tasks:
  - id: "setup-database"  # Added ID
    title: "Setup Database"
    estimationPercent: 30
  - id: "create-api"
    title: "Create API"
    estimationPercent: 40
    dependsOn: ["setup-database"]
  - id: "write-tests"
    title: "Write Tests"
    estimationPercent: 30
    dependsOn: ["setup-database"]
```

### Circular Dependencies

**Error Message:**
```
Circular dependency detected: task1 -> task2 -> task1
Break the circular dependency by removing one of these dependencies: "task1" depends on "task2", "task2" depends on "task1"
```

**Cause:** Tasks have circular dependency relationships.

**Solution:**
```yaml
# Before (circular):
tasks:
  - id: "task1"
    title: "Task 1"
    dependsOn: ["task2"]  # ❌ Circular!
  - id: "task2"
    title: "Task 2"
    dependsOn: ["task1"]  # ❌ Circular!

# After (fixed):
tasks:
  - id: "task1"
    title: "Task 1"
    # No dependencies
  - id: "task2"
    title: "Task 2"
    dependsOn: ["task1"]  # ✅ Linear dependency
```

---

## Condition Errors

### Invalid Condition Syntax

**Error Message:**
```
Invalid input for condition
💡 Conditions use structured objects such as `field`, `customField`, `all`, and `any`.
```

**Cause:** Condition uses the old string expression syntax instead of the structured condition format Atomize validates now.

**Solutions:**
1. **Use story variables:**
   ```yaml
   tasks:
     - title: "Backend Task"
       estimationPercent: 50
       condition:
         field: "tags"
         operator: "contains"
         value: "backend"
   ```

2. **Use custom fields:**
   ```yaml
   tasks:
     - title: "High Priority Task"
       estimationPercent: 30
       condition:
         customField: "Custom.Priority"
         operator: "equals"
         value: "High"
   ```

3. **Combine conditions:**
   ```yaml
   tasks:
     - title: "Complex Condition"
       estimationPercent: 40
       condition:
         all:
           - field: "tags"
             operator: "contains"
             value: "api"
           - field: "estimation"
             operator: "gt"
             value: 5
   ```

**Valid Operators:**
- `contains` / `not-contains`
- `equals` / `not-equals`
- `gt` / `lt` / `gte` / `lte`
- `all` / `any`

---

## Schema Errors

### Missing Required Field

**Error Message:**
```
Task title is required
💡 This field cannot be empty. Please provide a value.
```

**Cause:** A required field is missing or empty.

**Solution:**
```yaml
tasks:
  - title: "My Task"    # Added required title
    estimationPercent: 100
```

### Invalid Email Format

**Error Message:**
```
Invalid email
💡 Use a valid email address format (e.g., user@example.com) or the special value "@Me".
```

**Cause:** Email field has invalid format.

**Solutions:**
1. **Use valid email:**
   ```yaml
   filter:
     assignedTo: ["john.doe@example.com"]
   ```

2. **Use @Me macro:**
   ```yaml
   filter:
     assignedTo: ["@Me"]  # Refers to current user
   ```

### Type Mismatch

**Error Message:**
```
Expected a number but received string.
💡 Expected a number but received string. Remove quotes from numeric values.
```

**Cause:** Field has wrong type (e.g., string instead of number).

**Solutions:**
```yaml
# Wrong:
tasks:
  - title: "Task"
    estimationPercent: "50"  # ❌ String

# Correct:
tasks:
  - title: "Task"
    estimationPercent: 50    # ✅ Number
```

---

## Understanding Error Messages

### Error Message Format

Validation errors now include actionable suggestions:

```
[Error Path]: [Error Message]
   💡 [Suggestion]
```

**Example:**
```
tasks: Total estimation is 70%, but must be 100%.
   💡 Add 30% to existing tasks or create a new task with 30% estimation.
```

### Error vs Warning

- **Errors** (❌): Block template from being used. Must be fixed.
- **Warnings** (⚠️): Non-blocking issues. Template can still be used but may not work as expected.

**Example Output:**
```
Template validation failed:

Errors:
 - tasks: Total estimation is 70%, but must be 100%.
   💡 Add 30% to existing tasks or create a new task with 30% estimation.

Warnings:
 tasks[0].condition: Condition must be a structured object
   💡 Example: `condition: { field: "tags", operator: "contains", value: "backend" }`
```

### Validation Commands

**Validate a template:**
```bash
atomize validate my-template.yaml
```

**Strict validation (promotes warnings to errors):**
```bash
atomize validate my-template.yaml --strict
```

**Validation in CI/CD:**
```bash
# Exit code 0 = valid, 1 = invalid
atomize validate templates/*.yaml
if [ $? -eq 0 ]; then
  echo "All templates valid!"
else
  echo "Validation failed!"
  exit 1
fi
```

---

## Quick Reference

| Error Type | Key Indicator | Quick Fix |
|------------|---------------|-----------|
| Estimation too low | "Add X%" | Increase task percentages or add tasks |
| Estimation too high | "Reduce X%" | Decrease task percentages |
| Too few tasks | "Add X more task(s)" | Add more tasks |
| Too many tasks | "Remove X task(s)" | Remove tasks or increase limit |
| Invalid dependency | "non-existent task ID" | Fix ID or add missing task |
| Missing ID | "no id field" | Add `id: "task-name"` |
| Circular dependency | "Circular dependency detected" | Remove one dependency from cycle |
| Invalid condition | "structured object" | Use `field` / `customField` conditions |
| Invalid email | "Invalid email" | Use valid email or "@Me" |
| Wrong type | "Expected X but received Y" | Fix value type (number vs string) |

---

## Getting Help

If you encounter an error not covered here:

1. **Check the error message suggestion** - It often contains the exact fix needed
2. **Run with --strict** - Promotes warnings to errors for a complete picture
3. **Use the template wizard** - Interactive mode catches errors as you type
4. **Validate incrementally** - Test after each change

**Report Issues:**
- GitHub: https://github.com/Simao-Pereira-Gomes/Atomize/issues
- Include: Error message, template YAML, and validation output

---

## See Also

- [Template Reference](./Template-Reference.md) - Complete template schema
- [Validation Modes](./Validation-Modes.md) - Strict vs lenient validation explained
- [Getting Started](./Getting-Started.md) - Template basics
- [Template Wizard Guide](./template-wizard-guide.md) - Interactive template creation
