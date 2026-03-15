# Getting Started with Atomize

Welcome to Atomize! This guide will help you get up and running in minutes.

## Table of Contents

- [What is Atomize?](#what-is-atomize)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Your First Template](#your-first-template)
- [Generating Tasks](#generating-tasks)
- [Understanding Validation](#understanding-validation)
- [Common Workflows](#common-workflows)
- [Next Steps](#next-steps)
- [Troubleshooting](#troubleshooting)

---

## What is Atomize?

Atomize automatically generates sub-tasks from user stories using smart YAML templates. Instead of manually breaking down each story into tasks, Atomize:

- **Creates consistent task breakdowns** across your team
- **Saves time** on repetitive planning work
- **Distributes estimation** intelligently across tasks
- **Supports AI-powered** template generation
- **Works with** Azure DevOps (Jira & GitHub coming soon)

### How It Works

```
User Story (8 points)
    ↓
   Atomize + Template
    ↓
├─ Design API (1.2 points)
├─ Database Schema (1.2 points)
├─ Core Implementation (2.8 points)
├─ Unit Tests (1.2 points)
├─ Integration Tests (0.8 points)
└─ Code Review (0.8 points)
```

---

## Installation

### Prerequisites

- Node.js 18+ or Bun runtime
- Azure DevOps account (or use mock platform for testing)

### Install Globally

```bash
npm install -g @sppg2001/atomize
```

### Verify Installation

```bash
atomize --version
atomize --help
```

### Alternative: Use without Installing

```bash
npx @sppg2001/atomize generate templates/backend-api.yaml
```

---

## Quick Start

Let's generate tasks for some user stories in **5 minutes**!

### Step 1: Test with Mock Data

```bash
# Download a preset template
curl -o backend-api.yaml https://raw.githubusercontent.com/Simao-Pereira-Gomes/atomize/main/templates/presets/backend-api.yaml

# Preview without connecting to any platform
atomize generate backend-api.yaml --platform mock --dry-run
```

You'll see:

```
 ATOMIZATION RESULTS
========================================

Stories processed: 3
Tasks calculated:  18
Tasks created:     0 (dry run)

✓ STORY-001: Implement user authentication API
  Estimation: 8 points
  Tasks: 6

✓ STORY-003: Implement payment processing
  Estimation: 13 points
  Tasks: 6
```

### Step 2: Connect to Azure DevOps

Save your credentials as a named profile:

```bash
atomize auth add work-ado
# Prompts for org URL, project, team, and PAT
# Set as default when prompted
```

**Get a PAT:** `https://dev.azure.com/[your-org]/_usersSettings/tokens`
**Scopes needed:** Work Items (Read, Write)

Test the connection before generating:

```bash
atomize auth test work-ado
```

### Step 3: Generate Real Tasks

```bash
# Dry run first (always recommended)
atomize generate backend-api.yaml --dry-run

# Execute for real
atomize generate backend-api.yaml --execute
```

That's it! You've generated your first batch of tasks.

---

## Your First Template

Let's create a custom template for your team's workflow.

### Option 1: AI-Powered (Easiest)

```bash
# Using Google Gemini (free tier)
export GOOGLE_AI_API_KEY="your-api-key"  # Get from https://makersuite.google.com/app/apikey

atomize template create --ai "backend API with authentication and database"
```

The AI generates a complete template and lets you refine it interactively:
- **Accept** — Save the template
- **Refine** — Provide feedback to improve it
- **Regenerate** — Try a different version
- **Cancel** — Discard and exit

### Option 2: Start from Preset

```bash
# List available presets
atomize template list

# Create from a preset
atomize template create --preset backend-api
```

Available presets: `backend-api`, `frontend-feature`, `bug-fix`, `fullstack`

### Option 3: Interactive Wizard

```bash
atomize template create --scratch
```

Follow the step-by-step wizard:
1. Basic info (name, description)
2. Filter criteria (which stories to match)
3. Tasks (what to create)
4. Estimation settings
5. Validation rules (optional)
6. Metadata (optional)

### Option 4: Learn from Existing Work

```bash
# Learn from a single well-structured story
atomize template create \
  --from-story STORY-123 \
  --platform azure-devops \
  --normalize

# Learn from multiple stories for better pattern detection
atomize template create \
  --from-stories STORY-100,STORY-115,STORY-132 \
  --platform azure-devops \
  --normalize
```

Atomize analyzes the story's existing tasks and generates a reusable template. When using multiple stories, it detects patterns, scores confidence, and filters outliers. See [Story Learner](./Story-Learner.md) for details.

---

## Generating Tasks

### Basic Generation

```bash
# Preview first (always recommended)
atomize generate my-template.yaml --dry-run

# Execute when satisfied
atomize generate my-template.yaml --execute
```

### With Options

```bash
# Continue on errors (process all stories)
atomize generate my-template.yaml --execute --continue-on-error

# Verbose output (see details per story)
atomize generate my-template.yaml --execute --verbose

# Mock platform (testing, no credentials needed)
atomize generate my-template.yaml --platform mock --dry-run

# Increase concurrency for large backlogs
atomize generate my-template.yaml --execute --story-concurrency 8
```

### Understanding Output

```
 ATOMIZATION RESULTS
===========================================

 Summary:
  Template:          Backend API Development
  Stories processed: 5
  Stories success:   5
  Stories failed:    0
  Tasks calculated:  30
  Tasks created:     30
  Execution time:    3421ms

 Details:

✓ STORY-001: Implement user authentication API
  Estimation: 8 points
  Tasks: 6
  Distribution: 8 points (100%)
```

**Key metrics:**
- **Stories processed** — Total stories matching your filter
- **Tasks calculated** — Total tasks that would be / were created
- **Distribution** — How estimation was split across tasks

---

## Understanding Validation

Always validate templates before using them:

```bash
# Basic validation
atomize validate my-template.yaml

# Verbose output
atomize validate my-template.yaml --verbose

# Strict mode — warnings become errors (good for team templates)
atomize validate my-template.yaml --strict
```

**Valid template:**
```
Template is valid!

Summary:
  Name: Backend API Development
  Tasks: 6
  Total Estimation: 100%

Ready to use with: atomize generate my-template.yaml
```

**Invalid template:**
```
Template validation failed

Errors:
  ✗ tasks: Total estimation is 70%, but must be 100%
  ✗ tasks[2].dependsOn: Task depends on non-existent task ID

Fix the errors above and try again.
```

### Strict vs Lenient Mode

- **Lenient** (default) — Only hard errors block the template. Warnings are shown but non-blocking. Good for development.
- **Strict** — Warnings are treated as errors. Best for production templates and CI/CD.

See [Validation Modes](./Validation-Modes.md) for the full guide.

---

## Template Anatomy

Understanding a basic template:

```yaml
version: "1.0"
name: "Backend API Development"
description: "Standard backend API workflow"

# Which stories to match
filter:
  workItemTypes: ["User Story"]
  states: ["New", "Active"]
  tags:
    include: ["backend"]
  excludeIfHasTasks: true  # Skip stories that already have tasks

# What tasks to create
tasks:
  - title: "Design API: ${story.title}"   # ${story.title} = story's title
    estimationPercent: 15                  # 15% of story points
    activity: "Design"

  - title: "Implement: ${story.title}"
    estimationPercent: 50
    activity: "Development"
    assignTo: "@ParentAssignee"            # Inherit from story

  - title: "Unit Tests"
    estimationPercent: 20
    activity: "Testing"

  - title: "Code Review"
    estimationPercent: 15
    activity: "Documentation"

# How to calculate estimations
estimation:
  strategy: "percentage"
  rounding: "nearest"
  minimumTaskPoints: 0.5
```

### Key Concepts

**Variables**
```yaml
- title: "Implement: ${story.title}"     # Inserts story title
- description: "Story ${story.id}"       # Inserts story ID
```

**Assignment Patterns**
```yaml
- assignTo: "@ParentAssignee"  # Inherit from story
- assignTo: "@Me"               # Current user
- assignTo: "dev@company.com"   # Specific user
```

**Estimation**
```yaml
- estimationPercent: 30    # 30% of parent story points
- estimationFixed: 2       # Always 2 points (ignores parent estimation)
```

**Conditional Tasks**
```yaml
- title: "Security Review"
  estimationPercent: 10
  condition: '${story.tags} CONTAINS "security"'  # Only created if story has "security" tag
```

**Conditional Estimation** (v1.1)
```yaml
- title: "Implementation"
  estimationPercent: 50    # Default
  estimationPercentCondition:
    - condition: '${story.tags} CONTAINS "critical"'
      percent: 60          # Higher weight for critical stories
    - condition: "${story.estimation} >= 13"
      percent: 55          # More work for large stories
```

---

## Common Workflows

### Daily Usage

```bash
# Generate tasks for new stories
atomize generate templates/backend-api.yaml --execute

# Create a custom template for a special case
atomize template create --ai "database migration with rollback"

# Test the new template
atomize validate my-new-template.yaml
atomize generate my-new-template.yaml --dry-run

# Apply it
atomize generate my-new-template.yaml --execute
```

### Team Workflow

```
templates/
├── backend-api.yaml       # API development
├── frontend-feature.yaml  # UI features
├── bug-fix.yaml           # Bug fixes
└── database-change.yaml   # Schema changes
```

```bash
atomize generate templates/backend-api.yaml --execute
atomize generate templates/bug-fix.yaml --execute
```

### CI/CD Integration

```yaml
# .github/workflows/atomize.yml
name: Generate Tasks

on:
  schedule:
    - cron: '0 9 * * 1'  # Every Monday at 9am

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Atomize
        run: npm install -g @sppg2001/atomize

      - name: Validate Templates
        run: |
          for template in templates/*.yaml; do
            atomize validate "$template" --strict --quiet
          done

      - name: Save connection profile
        run: |
          atomize auth add ci \
            --org-url "${{ secrets.AZURE_DEVOPS_ORG_URL }}" \
            --project "${{ secrets.AZURE_DEVOPS_PROJECT }}" \
            --team "${{ secrets.AZURE_DEVOPS_TEAM }}" \
            --pat "${{ secrets.AZURE_DEVOPS_PAT }}" \
            --default

      - name: Generate Tasks
        run: |
          atomize generate templates/backend-api.yaml \
            --execute \
            --no-interactive \
            --continue-on-error
```

---

## Troubleshooting

### "No stories found"

**Solutions:**
1. Test with mock platform first:
   ```bash
   atomize generate my-template.yaml --platform mock --dry-run
   ```

2. Make the filter less restrictive:
   ```yaml
   filter:
     workItemTypes: ["User Story", "Product Backlog Item"]  # Add more types
     states: ["New", "Active", "Approved"]                  # Add more states
     # Remove or broaden tag filters
   ```

### "Authentication failed"

**Solutions:**
1. Check what profiles are saved:
   ```bash
   atomize auth list
   ```

2. Test the profile:
   ```bash
   atomize auth test work-ado
   ```

3. If the PAT has expired, rotate it:
   ```bash
   atomize auth rotate work-ado
   ```

4. Verify PAT has Work Items (Read, Write) scope

### "Validation failed"

**Solutions:**
1. Run validation with verbose flag:
   ```bash
   atomize validate my-template.yaml --verbose
   ```

2. Common issues:
   - Total estimation not 100%: Adjust task percentages
   - Missing required fields: Add `title` to all tasks
   - Invalid dependencies: Ensure task IDs exist

### "AI not available"

**For Gemini (cloud, free tier):**
```bash
export GOOGLE_AI_API_KEY="your-api-key"
# Get key: https://makersuite.google.com/app/apikey
```

**For Ollama (local, completely free):**
```bash
ollama pull llama3.2
ollama serve
```

---

## Next Steps

- [CLI Reference](./Cli-Reference.md) - Complete command and flag reference
- [Template Reference](./Template-Reference.md) - Full template schema documentation
- [Validation Modes](./Validation-Modes.md) - Strict vs lenient validation explained
- [Story Learner](./Story-Learner.md) - Generate templates from existing work items
- [Common Validation Errors](./Common-Validation-Errors.md) - Fix validation failures
- [Platform Guide](./Platform-Guide.md) - Azure DevOps setup and configuration
- [Template Wizard Guide](./template-wizard-guide.md) - Interactive wizard walkthrough
- [Examples](../examples/) - Real-world template examples

---

## Need Help?

- Read the [CLI Reference](./Cli-Reference.md)
- Search [GitHub Issues](https://github.com/Simao-Pereira-Gomes/atomize/issues)
- Start a [Discussion](https://github.com/Simao-Pereira-Gomes/atomize/discussions)
- [Report a Bug](https://github.com/Simao-Pereira-Gomes/atomize/issues/new)
