# Template Creation Wizard - User Guide

## Overview

The Template Creation Wizard is an interactive command-line tool that helps you create production-ready task templates for Atomize. It guides you through a step-by-step process to configure all aspects of your template without requiring any prior knowledge of YAML structure.

## Features

✅ **Interactive Step-by-Step Wizard** - Six clear steps guide you through template creation
✅ **Input Validation** - All inputs are validated in real-time with helpful error messages
✅ **Preview Before Saving** - Review and edit your template before committing
✅ **Error Recovery** - Cancel at any step or retry on errors

## Creation Modes

`template create` supports four modes. If you run it without flags, you are prompted to pick one:

| Mode | Flag | Best for |
|------|------|----------|
| From existing template | `--from <name>` | Customizing a built-in or team template |
| AI-assisted | `--ai` | Generating a first draft from a plain-language description |
| Story Learner | `--from-stories <ids>` | Capturing proven patterns from real work items |
| From scratch | `--scratch` | Full control via the interactive wizard |

---

## From an Existing Template

Start from a built-in or previously installed catalog template and customise it. This is the quickest way to create a team-specific variant of a standard template.

```bash
# See what's available
atomize template list

# Copy backend-api as a starting point
atomize template create --from backend-api
```

The wizard opens pre-populated with the source template's tasks, filter, and estimation settings. Edit what you need and save under a new name.

```bash
# Skip the mode prompt and go straight to the wizard with a pre-filled template
atomize template create --from backend-api --save-as my-backend-api
```

> **Migrating from v1?** The `--preset` flag was replaced by `--from` in v2. `--from backend-api` is the direct equivalent of the old `--preset backend-api`.

---

## AI-Assisted Generation

Describe the template you need in plain language and let the AI generate a first draft. You review, validate, and refine the result — the AI handles the structural boilerplate.

### Prerequisites

You need a **GitHub Models** connection profile:

```bash
atomize auth add my-ai
# When prompted for profile type, select: GitHub Models
# Enter your GitHub personal access token (models:read scope required)
atomize auth test my-ai
```

### Basic AI generation

```bash
atomize template create --ai
```

You will be prompted to describe the template you want. Example prompt:

```
Describe the template:
› A template for backend API stories. Tasks should cover API design,
  database schema, core implementation, unit tests, integration tests,
  and a code review. Estimation split should reflect that implementation
  takes roughly twice the time of testing.
```

Atomize sends your description to GitHub Models and returns a ready-to-review YAML template. You can accept it, edit it in the wizard, or regenerate with a refined prompt.

### Grounded generation

Pass `--ground` to give the AI additional context from your actual Azure DevOps workspace — field names, common tags, work item types, and past story patterns. This produces output that fits your team's conventions without manual editing.

```bash
atomize template create --ai --ground --profile work-ado
```

Use `--ground` when:
- Your ADO project uses custom fields or non-standard work item types
- You want task titles and activity types to match your team's existing naming
- You are generating a template that will run against real stories (not mock)

Skip `--ground` when:
- You are prototyping a generic template for testing
- You do not have an ADO profile configured yet

### Specifying an AI profile

If you have more than one GitHub Models profile, pass `--ai-profile` to select one:

```bash
atomize template create --ai --ai-profile my-ai
```

You can also set `ATOMIZE_AI_PROFILE` to avoid passing the flag every time.

### Post-generation workflow

AI-generated templates are a starting point, not a finished product. Always:

1. **Review the generated YAML** — the wizard shows a full preview before saving.
2. **Validate:**
   ```bash
   atomize validate template:<name> --strict --verbose
   ```
3. **Test with mock data:**
   ```bash
   atomize generate template:<name> --platform mock
   ```
4. **Refine** — common things to adjust: estimation splits, task titles, filter criteria, `condition` fields.

### Troubleshooting

**"No GitHub Models profile found"**

You have not yet added a GitHub Models profile. Run `atomize auth add` and select GitHub Models as the profile type.

**"AI generation failed"**

- Run `atomize auth test <profile>` to verify the token is valid.
- GitHub Models may be rate-limiting your token — wait a moment and retry.
- If the error persists, try without `--ground` to rule out an ADO connectivity issue.

**"Generated template does not validate"**

The AI occasionally produces YAML that fails strict validation (e.g. estimation not summing to 100%). Open the template for editing from the preview screen and fix the flagged fields.

---

## Getting Started

### Basic Usage

```bash
# Start the template creation wizard
atomize template create --scratch

# Or use the interactive mode selector
atomize template create
```

## Wizard Steps

### Step 1: Basic Information

Configure the fundamental properties of your template:

- **Template Name** (required, max 200 chars)
  - Choose a clear, descriptive name
  - Example: "Backend API Development"

- **Description** (optional, max 500 chars)
  - Detailed explanation of what this template is for
  - Example: "Template for developing RESTful API endpoints with tests"

- **Author** (optional)
  - Your name or team name
  - Default: "Atomize"

- **Tags** (optional)
  - Comma-separated tags for categorization
  - Example: "backend, api, development"

**Validation:**
- Template name cannot be empty
- All fields respect maximum character limits

### Step 2: Filter Configuration

Define which work items this template applies to.

The wizard first asks **how you want to select work items**:

```
How do you want to select work items?
› Build a filter  — choose types, states, tags, etc.
  Use a saved query  — reference an existing Azure DevOps query by ID or path
```

---

#### Option A: Build a filter (structured)

**Basic Filters:**
- **Work Item Types** - Select from common types or add custom ones
  - User Story, Bug, Task, Epic, Feature, Issue

- **States** - Select which work item states should match
  - New, Active, Removed, Resolved, Closed

- **Exclude if has tasks** - Prevent applying to items that already have tasks

**Advanced Filters:**
- Area paths
- Iterations
- Assigned to (email addresses)
- Priority range (1-4)
- Tags (include/exclude)
- Custom fields
- Custom WIQL query

---

#### Option B: Use a saved query

Reference an existing flat query saved in your Azure DevOps project. Atomize fetches the query's WIQL at run time and applies any supported post-filters on top of it.

**Prompts:**

1. **Reference by path or ID?**
   ```
   How do you want to reference the saved query?
   › By path  — e.g. Shared Queries/My Team/Open Stories
     By ID    — paste the query's UUID
   ```

2. **Query path** (if path selected)
   ```
   Saved query path:
   › Shared Queries/My Team/Open Stories
   ```
   Run `atomize queries list` beforehand to discover available paths.

3. **Query ID** (if ID selected)
   ```
   Saved query ID (UUID):
   › xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   ```
   Must be a valid UUID v4 (format: `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`).
   Run `atomize queries list` to copy the exact ID from the table.

4. **Exclude if has tasks** - Prevent applying to items that already have tasks
   (Available even when using a saved query.)

> **Tip:** Run `atomize queries list` to see all saved queries with their paths and IDs before creating a template.
> ```bash
> atomize queries list
> atomize queries list --folder "Shared Queries/My Team"
> ```

**Rules:**
- The referenced query must be a **flat list** query (not a tree or direct-links query).
- The query must already exist in Azure DevOps — it is not created by Atomize.
- You cannot specify both a path and an ID; the wizard enforces this automatically.

---

**Validation:**
- Warning shown if no filters are configured
- Can continue with empty filter (will match all work items)
- Mixed use of a saved query and structured filter fields produces a warning at generate time

### Step 3: Task Configuration

Create the tasks that will be added to matching work items:

**For Each Task:**
- **Task ID** (optional, max 30 chars)
  - Unique identifier for dependencies
  - Example: "design-api"

- **Title** (required, max 500 chars)
  - Clear, actionable task name
  - Example: "Design RESTful API endpoints"

- **Description** (optional, max 2000 chars)
  - Detailed task description

- **Estimation Percentage** (0-100)
  - What percentage of the story this task represents
  - Will be normalized to 100% total

**Advanced Options** (optional):
- Assignment (@ParentAssignee or specific email)
- Activity type (Development, Testing, Design, etc.)
- Acceptance criteria (with optional checklist format)
- Tags
- Dependencies (task IDs this task depends on)
- Condition (structured task condition)
- Custom fields (browse ADO task fields and store them by reference name)
- Priority (1-4)

**Validation:**
- At least one task is required
- All tasks must have titles
- Estimation percentages validated (0-100)
- Dependencies must reference valid task IDs

**Custom field authoring:**
- The wizard can fetch available task fields from ADO and present them by display name
- Picklist fields use a constrained select prompt instead of free-form entry
- When the same field exists on the parent story, the wizard can insert `{{ story.customFields['Reference.Name'] }}` as the task value
- The saved template always stores the field reference name internally

**Normalization:**
If total estimation ≠ 100%, you'll be prompted to normalize:
```
Total estimation is 80% (should be 100%)
Normalize estimations to sum to 100%? (Y/n)
```

**Edge Cases Handled:**
- Single task → Automatically set to 100%
- All tasks at 0% → Distributed equally
- Decimal percentages → Rounded to integers
- Remainder → Added to last task to ensure exactly 100%

### Step 4: Estimation Settings

Configure how story points are calculated:

- **Estimation Strategy**: percentage (default)
- **Rounding**: nearest | up | down | none
- **Minimum Task Points**: Minimum points per task (0 for no minimum)

### Step 5: Validation Rules (Optional)

Add constraints to ensure template correctness:

**Total Estimation Validation:**
- Must equal 100%
- Range (e.g., 95-105%)
- No validation

**Task Count Limits:**
- Minimum number of tasks
- Maximum number of tasks

### Step 6: Metadata (Optional)

Add metadata to help others understand your template:

- **Category** - e.g., "Backend Development"
- **Difficulty** - beginner | intermediate | advanced
- **Recommended For** - Comma-separated list
- **Estimation Guidelines** - Free text guidance

## Preview and Save

After completing all steps, you'll see a formatted preview:

```
Template Preview
==================================================

Basic Information:
  Name: Backend API Development
  Description: Template for RESTful API development
  Author: Development Team
  Tags: backend, api

Filter Configuration:
  Work Item Types: User Story
  States: New, Active
  Excludes items that already have tasks

Tasks (4):
  1. Design API endpoints [20%] ████
     Design RESTful API endpoints
  2. Implement endpoints [40%] ████████
     Implement API endpoints with validation
  3. Write tests [25%] █████
     Write unit and integration tests
  4. Documentation [15%] ███
     Document API endpoints and usage

Total Estimation: 100% ✓

Estimation Settings:
  Rounding: nearest

What would you like to do?
› Save template
  View full YAML
  Edit template
  Cancel
```

### Preview Actions

1. **Save template** - Proceed to final save confirmation
2. **View full YAML** - See the complete YAML representation
3. **Edit template** - Modify any section before saving
4. **Cancel** - Abort template creation

### Edit Mode

If you choose "Edit template", you can modify:
- Basic Information
- Filter Configuration
- Tasks (replaces all tasks)
- Estimation Settings
- Validation Rules
- Metadata

After editing, you'll return to the preview.

### Final Confirmation

Before saving, one final prompt:

```
📋 Final confirmation before saving...

Save this template? (Y/n)
```

## Edge Cases and Limits

### Character Limits
- Template name: 200 characters
- Template description: 500 characters
- Task title: 500 characters
- Task description: 2000 characters
- Task ID: 30 characters

### Special Characters
All special characters are supported:
- Unicode characters (你好, emoji)
- HTML-like content (escaped automatically)
- Quotes (single and double)
- Special symbols (!@#$%^&*)

### Maximum Limits
- Tasks: No hard limit, but warning shown after 20 tasks
- Tags: No limit
- Acceptance criteria: No limit
- Dependencies: No limit (must be valid task IDs)

### Estimation Edge Cases

#### Single Task with 100%
```
Input: 1 task with 50%
Output: 1 task with 100%
```

#### Multiple Tasks with 0%
```
Input: 3 tasks with 0% each
Output: Tasks with 34%, 33%, 33%
```

#### Decimal Percentages
```
Input: 3 tasks with 33.33% each
Output: Tasks with 33%, 33%, 34% (totaling 100%)
```

#### Very Small Values
```
Input: 3 tasks with 0.1%, 0.2%, 0.3%
Output: Tasks scaled proportionally to 100%
```

## Error Handling

### Validation Errors

Clear error messages for all validation failures:

```
✗ Configuration error: At least one task is required.
  Please add tasks to your template.
```

```
✗ Configuration error: Template name is required
```

```
✗ Configuration error: 2 task(s) are missing titles.
  All tasks must have a title.
```

### Cancellation

You can cancel at any step:

```
⚠  Template creation cancelled
```

No files are created or modified when you cancel.

### Retry on Error

If an error occurs during task configuration, you'll be prompted:

```
Error configuring tasks: [error message]

Try again? (Y/n)
```

## Examples

### Example 1: Simple Backend Template

```bash
atomize template create --scratch

# Step 1: Basic Information
Template name: Backend API
Description: Simple backend API development
Author: Dev Team
Tags: backend, api

# Step 2: Filter
Work Item Types: [User Story]
States: [New, Active]
Exclude if has tasks: Yes

# Step 3: Tasks
Task 1:
  Title: Design API
  Estimation: 30%

Task 2:
  Title: Implement API
  Estimation: 50%

Task 3:
  Title: Write Tests
  Estimation: 20%

# Normalize? Yes
# → Tasks normalized to 30%, 50%, 20% (already 100%)

# Step 4: Estimation
Rounding: nearest
Minimum points: 0

# Step 5: Validation
Add validation? No

# Step 6: Metadata
Add metadata? No

# Preview → Save → Confirm
```

### Example 2: Saved Query Filter

```bash
atomize queries list --folder "Shared Queries"

atomize template create --scratch

# Step 2: Filter Configuration
How do you want to select work items?
› Use a saved query

Reference by path or ID?
› By path

Saved query path:
› Shared Queries/My Team/Open Stories

Exclude if has tasks: Yes

# Continue with Steps 3–6 as normal
```

The generated YAML will include:

```yaml
filter:
  savedQuery:
    path: "Shared Queries/My Team/Open Stories"
  excludeIfHasTasks: true
```

---

### Example 3: Complex Template with Dependencies

```bash
atomize template create --scratch

# Step 3: Tasks with dependencies
Task 1:
  ID: design
  Title: API Design
  Estimation: 20%
  Advanced: Yes
    Activity: Design

Task 2:
  ID: implement
  Title: Implementation
  Estimation: 40%
  Advanced: Yes
    Depends on: design
    Activity: Development

Task 3:
  ID: test
  Title: Testing
  Estimation: 30%
  Advanced: Yes
    Depends on: implement
    Activity: Testing
    Acceptance criteria:
      - All endpoints return correct status codes
      - All edge cases are covered
    Display as checklist: Yes

Task 4:
  ID: docs
  Title: Documentation
  Estimation: 10%
  Advanced: Yes
    Depends on: implement
    Activity: Documentation
```

## Best Practices

### Naming
- Use descriptive, specific names
- Include the domain/area (e.g., "Backend", "Frontend", "DevOps")
- Keep names concise but meaningful

### Task Breakdown
- Break work into 3-8 tasks typically
- Each task should be independently testable
- Use task IDs for dependencies
- Set realistic estimation percentages

### Filters
- Be specific to avoid accidental matches
- Use "excludeIfHasTasks" to prevent duplicate applications
- Test filters with your actual work items
- Prefer **saved queries** when your team already maintains a query in Azure DevOps — it keeps filter logic in one place
- Run `atomize queries list` to explore available queries before creating a template

### Estimation
- Use percentage-based for flexibility
- Choose rounding strategy based on your workflow
- Consider setting minimum task points to avoid 0-point tasks

### Validation
- Use validation rules for critical templates
- Set task count limits for consistency
- Require 100% estimation for production templates

## Troubleshooting

### Template won't save
- Check for validation errors in preview
- Ensure at least one task exists
- Verify all required fields are filled

### Estimation doesn't sum to 100%
- Use the normalization feature when prompted
- Check for decimal values that may round incorrectly
- Verify all tasks have estimation percentages

### Dependencies not working
- Ensure task IDs are unique
- Check that dependent task IDs exist
- Dependencies must reference tasks in the same template

### Special characters causing issues
- All unicode and special characters are supported
- If issues persist, check your terminal encoding

## Command-Line Options

| Flag | Description |
|------|-------------|
| `--from <name>` | Start from an existing catalog template |
| `--from-stories <ids>` | Learn from existing stories (comma-separated IDs) |
| `--ai` | AI-assisted generation |
| `--ground` | Ground AI generation with ADO workspace context (requires `--ai`) |
| `--ai-profile <name>` | GitHub Models profile to use for AI (uses default if omitted) |
| `--scratch` | Go directly to the interactive wizard |
| `--type <type>` | Create a `template` or `mixin` |
| `--save-as <name>` | Catalog name for the saved result |
| `--profile <name>` | ADO profile for `--from-stories` and field suggestions |

## Related Commands

```bash
# List available catalog templates and mixins
atomize template list

# Validate a template before using it
atomize validate template:<name> --strict

# Test with mock data (no ADO connection needed)
atomize generate template:<name> --platform mock

# Generate for real
atomize generate template:<name> --execute

# Discover saved queries (useful before configuring a savedQuery filter)
atomize queries list
atomize queries list --folder "Shared Queries/My Team"
```

After creating your template:

1. **Validate it:**
   ```bash
   atomize validate template:<name> --strict --verbose
   ```

2. **Test with mock data:**
   ```bash
   atomize generate template:<name> --platform mock
   ```

3. **Review generated tasks** before applying to production:
   ```bash
   atomize generate template:<name> --verbose
   ```

## Support

For issues or questions:
- GitHub: https://github.com/Simao-Pereira-Gomes/Atomize/issues
- Check validation output for detailed error messages
- Review the template YAML for syntax issues
