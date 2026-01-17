# Template Creation Wizard - User Guide

## Overview

The Template Creation Wizard is an interactive command-line tool that helps you create production-ready task templates for Atomize. It guides you through a step-by-step process to configure all aspects of your template without requiring any prior knowledge of YAML structure.

## Features

✅ **Interactive Step-by-Step Wizard** - Six clear steps guide you through template creation
✅ **Input Validation** - All inputs are validated in real-time with helpful error messages
✅ **Preview Before Saving** - Review and edit your template before committing
✅ **Estimation Normalization** - Automatic percentage normalization to ensure 100% total
✅ **Cross-Platform Compatible** - Works on Windows, macOS, and Linux
✅ **Error Recovery** - Cancel at any step or retry on errors

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

Define which work items this template applies to:

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
- Priority range (1-5)
- Tags (include/exclude)
- Custom fields
- Custom WIQL query

**Validation:**
- Warning shown if no filters are configured
- Can continue with empty filter (will match all work items)

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
- Condition (template expression)
- Priority (1-4)
- Remaining work (hours)

**Validation:**
- At least one task is required
- All tasks must have titles
- Estimation percentages validated (0-100)
- Dependencies must reference valid task IDs

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

### Example 2: Complex Template with Dependencies

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

```bash
# Create from scratch (skip mode selection)
atomize template create --scratch

# Specify output path
atomize template create --scratch -o path/to/template.yaml

# Non-interactive mode (use flags only)
atomize template create --no-interactive --scratch
```

## Related Commands

```bash
# Validate a template
atomize template validate path/to/template.yaml

# List all templates
atomize template list


After creating your template:

1. **Validate it:**
   ```bash
   atomize template validate path/to/template.yaml
   ```

2. **Test on a sample work item:**
   ```bash
   atomize apply -t path/to/template.yaml -i SAMPLE_ID --dry-run
   ```

3. **Review generated tasks** before applying to production

## Support

For issues or questions:
- GitHub: https://github.com/Simao-Pereira-Gomes/Atomize/issues
- Check validation output for detailed error messages
- Review the template YAML for syntax issues

