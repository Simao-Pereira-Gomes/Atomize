# Getting Started with Atomize

Welcome to Atomize! This guide will help you get up and running in minutes.

## Table of Contents

- [What is Atomize?](#what-is-atomize)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Your First Template](#your-first-template)
- [Generating Tasks](#generating-tasks)
- [Next Steps](#next-steps)

---

## What is Atomize?

Atomize automatically generates sub-tasks from user stories using smart YAML templates. Instead of manually breaking down each story into tasks, Atomize:

✨ **Creates consistent task breakdowns** across your team  
⚡ **Saves time** on repetitive planning work  
🎯 **Distributes estimation** intelligently across tasks  
🤖 **Supports AI-powered** template generation  
🔄 **Works with** Azure DevOps (Jira & GitHub coming soon)

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
curl -o backend-api.yaml https://raw.githubusercontent.com/Simao-Pereira-Gomes/atomize/main/templates/presets/backend-api.yaml

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

```bash
# Set up environment variables
export AZURE_DEVOPS_ORG_URL="https://dev.azure.com/yourorg"
export AZURE_DEVOPS_PROJECT="YourProject"
export AZURE_DEVOPS_PAT="your-personal-access-token"

# Or create .env file
cat > .env << EOF
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/yourorg
AZURE_DEVOPS_PROJECT=YourProject
AZURE_DEVOPS_PAT=your-pat-token
EOF
```

**Get a PAT:** https://dev.azure.com/[your-org]/_usersSettings/tokens  
**Scopes needed:** Work Items (Read, Write)

### Step 3: Generate Real Tasks

```bash
# Dry run first (preview)
atomize generate backend-api.yaml --dry-run

# Execute for real
atomize generate backend-api.yaml --execute
```
 **That's it!** You've generated your first batch of tasks.

---

## Your First Template

Let's create a custom template for your team's workflow.

### Option 1: AI-Powered (Easiest)

```bash
# Using Google Gemini (free tier)
export GOOGLE_AI_API_KEY="your-api-key"  # Get from https://makersuite.google.com/app/apikey

atomize template create --ai "backend API with authentication and database"
```

The AI will generate a complete template and let you refine it interactively.

### Option 2: Start from Preset

```bash
# List available presets
atomize template list

# Create from preset
atomize template create --preset backend-api

# Customize if needed
```

### Option 3: Interactive Wizard

```bash
atomize template create --scratch
```

Follow the step-by-step wizard to build your template:
1. Basic info (name, description)
2. Filter criteria (which stories to match)
3. Tasks (what to create)
4. Estimation settings
5. Validation rules (optional)

### Option 4: Learn from Existing Work

```bash
# Learn from a well-structured story
atomize template create \
  --from-story STORY-123 \
  --platform azure-devops \
  --normalize
```

Atomize will analyze the story and its tasks, then generate a reusable template.

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

# Verbose output (see details)
atomize generate my-template.yaml --execute --verbose

# Mock platform (testing)
atomize generate my-template.yaml --platform mock --dry-run
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

✓ STORY-002: Create user profile API
  Estimation: 5 points
  Tasks: 6
  Distribution: 5 points (100%)
```

**Key metrics:**
- **Stories processed**: Total stories matching your filter
- **Tasks calculated**: Total tasks that would be/were created
- **Distribution**: How estimation was split across tasks

---

## Template Anatomy

Let's understand a basic template:

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
  - title: "Design API: ${story.title}"
    estimationPercent: 15     # 15% of story points
    activity: "Design"
    tags: ["design", "api"]
    
  - title: "Implement: ${story.title}"
    estimationPercent: 50     # 50% of story points
    activity: "Development"
    assignTo: "@ParentAssignee"  # Inherit from story
    
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

**1. Variables**
```yaml
- title: "Implement: ${story.title}"  # Inserts story title
- description: "For story ${story.id}: ${story.description}"
```

**2. Assignment Patterns**
```yaml
- assignTo: "@ParentAssignee"  # Inherit from story
- assignTo: "@Me"               # Current user
- assignTo: "dev@company.com"   # Specific user
```

**3. Estimation**
```yaml
- estimationPercent: 30    # 30% of parent estimation
- estimationFixed: 2       # Always 2 points
```

**4. Conditional Tasks**
```yaml
- title: "Security Review"
  estimationPercent: 10
  condition: '${story.tags} CONTAINS "security"'  # Only if story has "security" tag
```

---

## Common Workflows

### Daily Usage

```bash
# 1. Morning: Generate tasks for new stories
atomize generate templates/backend-api.yaml --execute

# 2. Create custom template for special case
atomize template create --ai "database migration with rollback"

# 3. Test new template
atomize validate my-new-template.yaml
atomize generate my-new-template.yaml --dry-run

# 4. Apply
atomize generate my-new-template.yaml --execute
```

### Team Workflow

```bash
# templates/
├── backend-api.yaml       # API development
├── frontend-feature.yaml  # UI features
├── bug-fix.yaml           # Bug fixes
├── database-change.yaml   # Schema changes
└── security-review.yaml   # Security audits

# Usage
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
      - uses: actions/checkout@v3
      
      - name: Install Atomize
        run: npm install -g @sppg2001/atomize
      
      - name: Generate Tasks
        env:
          AZURE_DEVOPS_ORG_URL: ${{ secrets.AZURE_DEVOPS_ORG_URL }}
          AZURE_DEVOPS_PROJECT: ${{ secrets.AZURE_DEVOPS_PROJECT }}
          AZURE_DEVOPS_PAT: ${{ secrets.AZURE_DEVOPS_PAT }}
        run: |
          atomize generate templates/backend-api.yaml --execute --continue-on-error
          atomize generate templates/frontend-feature.yaml --execute --continue-on-error
```

---

## Validation

Always validate templates before using them:

```bash
# Basic validation
atomize validate my-template.yaml

# Verbose output
atomize validate my-template.yaml --verbose
```

**Valid template:**
```
✓ Template is valid!

Summary:
  Name: Backend API Development
  Tasks: 6
  Total Estimation: 100%

Ready to use with atomize generate
```

**Invalid template:**
```
✗ Template validation failed

Errors:
  • tasks: Total estimation is 70%, but must be 100%
  • tasks[2].dependsOn: Task depends on non-existent task ID

Fix the errors above and try again.
```

---

## Troubleshooting

### "No stories found"

**Problem:** Template matches zero stories

**Solutions:**
1. Test with mock platform first:
   ```bash
   atomize generate my-template.yaml --platform mock --dry-run
   ```

2. Make filter less restrictive:
   ```yaml
   filter:
     workItemTypes: ["User Story", "Product Backlog Item"]  # Add more types
     states: ["New", "Active", "Approved"]                  # Add more states
     # Remove or relax other filters
   ```

3. Check your work item types and states match selected platform

### "Authentication failed"

**Problem:** Can't connect to Azure DevOps

**Solutions:**
1. Verify environment variables:
   ```bash
   echo $AZURE_DEVOPS_ORG_URL
   echo $AZURE_DEVOPS_PROJECT
   echo $AZURE_DEVOPS_PAT
   ```

2. Check PAT hasn't expired

3. Verify PAT has Work Items (Read, Write) scope

4. Test with curl:
   ```bash
   curl -u :$AZURE_DEVOPS_PAT \
     "$AZURE_DEVOPS_ORG_URL/$AZURE_DEVOPS_PROJECT/_apis/wit/workitems?api-version=7.0"
   ```

### "Validation failed"

**Problem:** Template has errors

**Solutions:**
1. Run validation:
   ```bash
   atomize validate my-template.yaml --verbose
   ```

2. Common issues:
   - Total estimation not 100%: Adjust task percentages
   - Missing required fields: Add `title` to all tasks
   - Invalid dependencies: Ensure task IDs exist

### "AI not available"

**Problem:** No AI provider configured

**Solutions:**

**For Gemini (cloud, free tier):**
```bash
# Get API key: https://makersuite.google.com/app/apikey
export GOOGLE_AI_API_KEY="your-api-key"
```

**For Ollama (local, completely free):**
```bash
# Install: https://ollama.ai
ollama pull llama3.2
ollama serve
```

---

## Next Steps

### Learn More

📚 **Documentation:**
- [CLI Reference](./CLI-REFERENCE.md) - Complete command reference
- [Template Reference](./TEMPLATE-REFERENCE.md) - Template schema details
- [Platform Guide](./PLATFORM-GUIDE.md) - Platform setup and configuration

🎯 **Examples:**
- [Example Templates](../examples/) - Real-world templates
### Join the Community

---

## Need Help?

- 📖 Read the [CLI Reference](./Cli-Reference.md)
- 🔍 Search [GitHub Issues](https://github.com/Simao-Pereira-Gomes/atomize/issues)
- 💬 Start a [Discussion](https://github.com/Simao-Pereira-Gomes/atomize/discussions)
- � [Report a Bug](https://github.com/Simao-Pereira-Gomes/atomize/issues/new)