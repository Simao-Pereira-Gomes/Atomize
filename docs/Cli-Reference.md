# Atomize CLI Reference

Complete command-line interface documentation for Atomize.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Commands Overview](#commands-overview)
- [Command Reference](#command-reference)
  - [generate](#generate)
  - [validate](#validate)
  - [template](#template)
- [Configuration](#configuration)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

---

## Installation

```bash
# Global installation
npm install -g @sppg2001/atomize

# Verify installation
atomize --version

# Show help
atomize --help
```

## Quick Start

```bash
# 1. Validate a template
atomize validate templates/backend-api.yaml

# 2. Generate tasks (dry run)
atomize generate templates/backend-api.yaml --dry-run

# 3. Generate tasks (live)
atomize generate templates/backend-api.yaml --execute

# 4. Create a new template with AI
atomize template create --ai "backend API with authentication"
```

---

## Commands Overview

| Command | Alias | Description |
|---------|-------|-------------|
| `generate` | `gen` | Generate tasks from user stories using a template |
| `validate` | - | Validate a template file |
| `template` | `tpl` | Template management commands |
| `template create` | - | Create a new template interactively |
| `template list` | `ls` | List available template presets |

---

## Command Reference

### generate

Generate tasks from user stories using a template.

#### Usage

```bash
atomize generate [template] [options]
atomize gen [template] [options]  # alias
```

#### Arguments

- `[template]` - Path to template file (YAML). If omitted, you'll be prompted.

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `-p, --platform <platform>` | string | `azure-devops` | Platform to use |
| `--project <name>` | string | - | Project name |
| `--dry-run` | boolean | `false` | Preview without creating tasks |
| `--execute` | boolean | `false` | Execute task creation (opposite of dry-run) |
| `--continue-on-error` | boolean | `false` | Continue processing even if errors occur |
| `-v, --verbose` | boolean | `false` | Show detailed output |

#### Examples

**Interactive mode (no template specified):**
```bash
atomize generate
# You'll be prompted for:
# - Template file path
# - Platform selection (mock or azure-devops)
# - Dry run preference
```

**Dry run with explicit template:**
```bash
atomize generate templates/backend-api.yaml --dry-run
```

**Live execution:**
```bash
atomize generate templates/backend-api.yaml --execute
```

**Mock platform (for testing):**
```bash
atomize generate templates/backend-api.yaml --platform mock --dry-run
```

**Azure DevOps with verbose output:**
```bash
atomize generate templates/backend-api.yaml \
  --platform azure-devops \
  --execute \
  --verbose
```

**Continue on errors:**
```bash
atomize generate templates/backend-api.yaml \
  --execute \
  --continue-on-error
```

#### Platform Configuration

**Azure DevOps:**

The CLI will prompt you to choose between:
1. Load configuration from environment variables
2. Enter configuration manually

**Environment variables:**
```bash
export AZURE_DEVOPS_ORG_URL="https://dev.azure.com/yourorg"
export AZURE_DEVOPS_PROJECT="YourProject"
export AZURE_DEVOPS_PAT="your-personal-access-token"
```

**Get a PAT (Personal Access Token):**
1. Go to `https://dev.azure.com/[your-org]/_usersSettings/tokens`
2. Create new token with scopes: Work Items (Read, Write)

**Mock Platform:**

No configuration needed. Uses sample data for testing.

#### Output

The command outputs:
- Summary of stories processed
- Tasks calculated and created
- Estimation distribution per story
- Errors and warnings (if any)
- Execution time

**Example output:**
```
========================================================================
  ATOMIZATION RESULTS
========================================================================

 Summary:
  Template:          Backend API Development
  Stories processed: 3
  Stories success:   3
  Stories failed:    0
  Tasks calculated:  18
  Tasks created:     18
  Execution time:    2547ms

 Details:

✓ STORY-001: Implement user authentication API
  Estimation: 8 points
  Tasks: 6
  Distribution: 8 points (100%)

✓ STORY-003: Implement payment processing
  Estimation: 13 points
  Tasks: 6
  Distribution: 13 points (100%)

SUCCESS - Created 18 tasks for 3 stories
```

---

### validate

Validate a template file for correctness and completeness.

#### Usage

```bash
atomize validate <template> [options]
```

#### Arguments

- `<template>` - Path to template file (YAML). **Required.**

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `-v, --verbose` | boolean | `false` | Show detailed validation information |

#### Examples

**Basic validation:**
```bash
atomize validate templates/backend-api.yaml
```

**Verbose output:**
```bash
atomize validate templates/backend-api.yaml --verbose
```

#### Output

**Valid template:**
```
Template is valid!

Summary:
  Name: Backend API Development
  Tasks: 6
  Total Estimation: 100%

Ready to use with atomize generate
```

**Invalid template:**
```
Template validation failed

Errors:
  • tasks: Total estimation is 70%, but must be 100%
  • tasks[2].dependsOn: Task depends on non-existent task ID: "nonexistent-task"

Warnings:
  • tasks[1].condition: Condition "true" might be invalid (no variables found)

Fix the errors above and try again.
```

#### Exit Codes

- `0` - Template is valid
- `1` - Template validation failed

---

### template

Template management commands.

#### Subcommands

- `create` - Create a new template interactively
- `list` (alias: `ls`) - List available template presets

---

### template create

Create a new template using various methods.

#### Usage

```bash
atomize template create [options]
atomize tpl create [options]  # alias
```

#### Options

| Option | Type | Description |
|--------|------|-------------|
| `--ai <prompt>` | string | Generate template using AI |
| `--ai-provider <provider>` | string | Force AI provider: `gemini` or `ollama` |
| `--api-key <key>` | string | Google Gemini API key (if not in environment) |
| `--model <name>` | string | AI model name |
| `--preset <name>` | string | Start from a preset template |
| `--from-story <id>` | string | Learn template from existing story |
| `-p, --platform <platform>` | string | Platform to use (for `--from-story`) |
| `--normalize` | boolean | Normalize task estimation percentages to 100% |
| `--no-normalize` | boolean | Keep original estimation percentages |
| `--scratch` | boolean | Create from scratch (skip mode selection) |
| `-o, --output <path>` | string | Output file path |
| `--no-interactive` | boolean | Skip all prompts (use with flags only) |

#### Creation Modes

**1. AI-Powered (Free)**

Generate templates using AI based on natural language descriptions.

```bash
# With interactive provider selection
atomize template create --ai "backend API with authentication and rate limiting"

# Force Gemini (cloud, requires API key)
atomize template create \
  --ai "frontend React dashboard with charts" \
  --ai-provider gemini \
  --api-key "your-gemini-api-key"

# Force Ollama (local, completely free)
atomize template create \
  --ai "bug fix workflow" \
  --ai-provider ollama \
  --model llama3.2
```

**Gemini Setup:**
```bash
# Get free API key from https://makersuite.google.com/app/apikey
export GOOGLE_AI_API_KEY="your-api-key-here"
```

**Ollama Setup:**
```bash
# Install from https://ollama.ai
# Download a model
ollama pull llama3.2

# Start server
ollama serve
```

**2. From Preset**

Start with a battle-tested template.

```bash
# Interactive selection
atomize template create --preset

# Direct preset selection
atomize template create --preset backend-api

# List available presets
atomize template list
```

Available presets:
- `backend-api` - Backend API with database
- `frontend-feature` - React/Vue frontend feature
- `bug-fix` - Bug investigation and resolution
- `fullstack` - Complete fullstack feature

**3. From Existing Story**

Learn from a story that already has tasks.

```bash
# With Azure DevOps
atomize template create --from-story STORY-123 --platform azure-devops

# With normalization (default)
atomize template create --from-story STORY-123 --normalize

# Keep original percentages
atomize template create --from-story STORY-123 --no-normalize

# With mock platform (testing)
atomize template create --from-story STORY-001 --platform mock
```

**4. From Scratch (Wizard)**

Step-by-step interactive builder.

```bash
# Interactive wizard
atomize template create --scratch

# With custom output path
atomize template create --scratch --output my-templates/custom.yaml
```

The wizard guides you through:
1. Basic Information (name, description, author, tags)
2. Filter Configuration (work item types, states, tags, etc.)
3. Task Configuration (add tasks with estimations)
4. Estimation Settings (strategy, rounding, minimums)
5. Validation Rules (optional)
6. Metadata (optional)

#### Examples

**AI with refinement loop:**
```bash
atomize template create --ai "microservice deployment"
# Generates template
# Shows preview
# Options: Accept, Refine, Regenerate, or Cancel
```

**Preset with customization:**
```bash
atomize template create --preset backend-api
# Loads preset
# Option to customize name and description
```

**Story learning with context:**
```bash
atomize template create \
  --from-story STORY-456 \
  --platform azure-devops \
  --normalize \
  --output learned-templates/story-456.yaml
```

**Non-interactive (CI/CD):**
```bash
atomize template create \
  --ai "simple bug fix" \
  --ai-provider ollama \
  --output templates/auto-bug-fix.yaml \
  --no-interactive
```

#### Output

Templates are saved to:
- Default: `./createdTemplates/template-YYYYMMDD-XXXX.yaml`
- Custom: Path specified with `--output`

**Example output:**
```
✓ Template created successfully!

Template saved to createdTemplates/template-20241229-a3f2.yaml

Try it out with: atomize validate createdTemplates/template-20241229-a3f2.yaml
```

---

### template list

List all available template presets.

#### Usage

```bash
atomize template list
atomize template ls      # alias
atomize tpl list         # alias
atomize tpl ls           # alias
```

#### Examples

```bash
atomize template list
```

#### Output

```
 Available Template Presets

backend-api
  Backend API Development
  Standard backend API development with database integration

frontend-feature
  Frontend Feature Development
  UI/UX feature development with React/Vue components

bug-fix
  Bug Fix
  Standard bug investigation and resolution workflow

Use with: atomize template create --preset <name>
```

---

## Configuration

### Environment Variables

**Azure DevOps:**
```bash
# Required
export AZURE_DEVOPS_ORG_URL="https://dev.azure.com/myorg"
export AZURE_DEVOPS_PROJECT="MyProject"
export AZURE_DEVOPS_PAT="your-pat-token"

# Optional
export AZURE_DEVOPS_TEAM="MyTeam"
```

**Google Gemini AI:**
```bash
export GOOGLE_AI_API_KEY="your-gemini-api-key"
```

**Logging:**
```bash
# Set log level (debug, info, warn, error)
export LOG_LEVEL="info"
```

### Configuration Files

Create `.env` file in your project:
```bash
# Copy example
cp .env.example .env

# Edit with your values
nano .env
```

---

## Examples

### Complete Workflows

**1. First-time setup with Azure DevOps:**

```bash
# 1. Set up environment
cat > .env << EOF
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/myorg
AZURE_DEVOPS_PROJECT=MyProject
AZURE_DEVOPS_PAT=your-pat-here
EOF

# 2. Create a template
atomize template create --preset backend-api -o my-backend.yaml

# 3. Validate it
atomize validate my-backend.yaml

# 4. Test with dry run
atomize generate my-backend.yaml --dry-run

# 5. Execute for real
atomize generate my-backend.yaml --execute
```

**2. AI-powered template creation:**

```bash
# 1. Set up Gemini (or use Ollama)
export GOOGLE_AI_API_KEY="your-key"

# 2. Generate template
atomize template create --ai "REST API with PostgreSQL and Redis caching"

# Template will be refined interactively
# Select: Accept, Refine, Regenerate, or Cancel

# 3. Use the generated template
atomize generate createdTemplates/template-*.yaml --dry-run
```

**3. Learn from existing work:**

```bash
# 1. Find a well-structured story with tasks
atomize template create \
  --from-story STORY-789 \
  --platform azure-devops \
  --normalize \
  --output learned/api-pattern.yaml

# 2. Review the learned template
atomize validate learned/api-pattern.yaml --verbose

# 3. Apply to similar stories
atomize generate learned/api-pattern.yaml --execute
```

**4. Batch processing multiple templates:**

```bash
#!/bin/bash
# process-stories.sh

TEMPLATES=(
  "templates/backend-api.yaml"
  "templates/frontend-feature.yaml"
  "templates/bug-fix.yaml"
)

for template in "${TEMPLATES[@]}"; do
  echo "Processing: $template"
  atomize generate "$template" --execute --continue-on-error
  echo "---"
done
```

**5. CI/CD integration:**

```bash
# .github/workflows/generate-tasks.yml
name: Generate Tasks

on:
  push:
    paths:
      - 'templates/*.yaml'

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      
      - name: Install Atomize
        run: npm install -g @sppg2001/atomize
      
      - name: Validate Templates
        run: |
          for template in templates/*.yaml; do
            atomize validate "$template"
          done
      
      - name: Generate Tasks (Dry Run)
        env:
          AZURE_DEVOPS_ORG_URL: ${{ secrets.AZURE_DEVOPS_ORG_URL }}
          AZURE_DEVOPS_PROJECT: ${{ secrets.AZURE_DEVOPS_PROJECT }}
          AZURE_DEVOPS_PAT: ${{ secrets.AZURE_DEVOPS_PAT }}
        run: |
          atomize generate templates/backend-api.yaml --dry-run --verbose
```

---

## Troubleshooting

### Common Issues

#### "Not authenticated" error

**Problem:**
```
Error: Not authenticated. Call authenticate() first.
```

**Solution:**
```bash
# Check environment variables
echo $AZURE_DEVOPS_ORG_URL
echo $AZURE_DEVOPS_PROJECT
echo $AZURE_DEVOPS_PAT

# If missing, set them
export AZURE_DEVOPS_ORG_URL="https://dev.azure.com/myorg"
export AZURE_DEVOPS_PROJECT="MyProject"
export AZURE_DEVOPS_PAT="your-pat"

# Or run interactively (it will prompt)
atomize generate templates/backend-api.yaml
```

#### Template validation failed

**Problem:**
```
Error: Total estimation is 70%, but must be 100%
```

**Solution:**
```bash
# Edit your template to ensure tasks sum to 100%
# OR add validation config to allow ranges:

validation:
  totalEstimationRange:
    min: 95
    max: 105
```

#### No matching stories found

**Problem:**
```
Found 0 stories matching filter criteria
```

**Solution:**
```bash
# 1. Check your filter in the template
# 2. Test with mock platform first
atomize generate templates/backend-api.yaml --platform mock --dry-run

# 3. Make filter less restrictive:
# - Remove or broaden states
# - Remove or change tags
# - Set excludeIfHasTasks: false
```

#### AI provider not available

**Problem:**
```
Error: No AI provider available. Please configure Gemini or Ollama.
```

**Solution:**

For Gemini:
```bash
# Get API key from https://makersuite.google.com/app/apikey
export GOOGLE_AI_API_KEY="your-api-key"
```

For Ollama:
```bash
# Install Ollama from https://ollama.ai
# Download model
ollama pull llama3.2

# Start server
ollama serve

# Verify it's running
curl http://localhost:11434/api/tags
```

#### Permission denied (Windows)

**Problem:**
```
atomize : File cannot be loaded because running scripts is disabled
```

**Solution:**
```powershell
# Run PowerShell as Administrator
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Or use npx
npx @sppg2001/atomize generate templates/backend-api.yaml
```

#### Module not found after global install

**Problem:**
```
Error: Cannot find module '@sppg2001/atomize'
```

**Solution:**
```bash
# Reinstall globally
npm uninstall -g @sppg2001/atomize
npm install -g @sppg2001/atomize

# Or use without global install
npx @sppg2001/atomize generate templates/backend-api.yaml
```

### Getting Help

**Enable verbose logging:**
```bash
export LOG_LEVEL="debug"
atomize generate templates/backend-api.yaml --verbose
```

**Check version:**
```bash
atomize --version
```

**Show command help:**
```bash
atomize --help
atomize generate --help
atomize template create --help
```

**Report issues:**
- GitHub Issues: https://github.com/Simao-Pereira-Gomes/atomize/issues
- Include: Command used, error message, template file (if relevant)

---

## Advanced Usage

### Custom Assignment Patterns

Templates support special assignment values:

```yaml
tasks:
  - title: "Code Review"
    estimationPercent: 10
    assignTo: "@ParentAssignee"  # Inherit from story
    
  - title: "Testing"
    estimationPercent: 15
    assignTo: "@Inherit"  # Same as @ParentAssignee
    
  - title: "Documentation"
    estimationPercent: 10
    assignTo: "@Me"  # Current user
    
  - title: "Deployment"
    estimationPercent: 5
    assignTo: "@Unassigned"  # Let system decide
    
  - title: "Design Review"
    estimationPercent: 10
    assignTo: "architect@company.com"  # Specific user
```

### Variable Interpolation

Use variables in task titles and descriptions:

```yaml
tasks:
  - title: "Design API: ${story.title}"
    description: |
      Design REST API for ${story.title}
      
      Story Details:
      ${story.description}
      
      Story ID: ${story.id}
```

Available variables:
- `${story.title}` - Story title
- `${story.id}` - Story ID
- `${story.description}` - Story description

### Conditional Tasks

Tasks can be conditional based on story properties:

```yaml
tasks:
  - title: "Security Review"
    estimationPercent: 10
    condition: '${story.tags} CONTAINS "security"'
    
  - title: "Database Migration"
    estimationPercent: 15
    condition: '${story.tags} CONTAINS "database" AND ${story.estimation} > 5'
```

Condition operators:
- `CONTAINS` - String contains
- `AND`, `OR` - Logical operators
- `==`, `!=` - Equality
- `>`, `<`, `>=`, `<=` - Comparison

### Custom Fields

Filter and set custom fields:

```yaml
filter:
  customFields:
    - field: "Custom.Team"
      operator: "equals"
      value: "Platform Engineering"
    
    - field: "Custom.Complexity"
      operator: "greaterThan"
      value: 3

tasks:
  - title: "Implementation"
    estimationPercent: 50
    customFields:
      Custom.Complexity: "High"
      Custom.TechStack: "Node.js, PostgreSQL"
```

### Task Dependencies

Define task execution order:

```yaml
tasks:
  - id: "design"
    title: "Design API"
    estimationPercent: 15
    
  - id: "implement"
    title: "Implement API"
    estimationPercent: 40
    dependsOn: ["design"]
    
  - id: "test"
    title: "Test API"
    estimationPercent: 25
    dependsOn: ["implement"]
    
  - id: "document"
    title: "Document API"
    estimationPercent: 20
    dependsOn: ["implement", "test"]
```

---

## Performance Tips

1. **Use dry-run first** - Always test with `--dry-run` before `--execute`
2. **Use continue-on-error** - Don't stop on first failure: `--continue-on-error`
3. **Mock platform for testing** - Use `--platform mock` for template development
4. 
---

## See Also

- [Template Reference](./Template-Reference.md) - Complete template schema
- [Platform Guide](./Platform-Guide.md) - Platform setup and configuration
- [Examples](../examples/) - Real-world template examples
- [Contributing](../Contributing.md) - How to contribute