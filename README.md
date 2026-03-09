# Atomize

[![CI](https://github.com/Simao-Pereira-Gomes/atomize/actions/workflows/ci.yml/badge.svg)](https://github.com/Simao-Pereira-Gomes/atomize/actions/workflows/ci.yml)
[![Code Quality](https://github.com/Simao-Pereira-Gomes/atomize/actions/workflows/code-quality.yml/badge.svg)](https://github.com/Simao-Pereira-Gomes/atomize/actions/workflows/code-quality.yml)
[![NPM Version](https://img.shields.io/npm/v/@sppg2001/atomize)](https://www.npmjs.com/package/@sppg2001/atomize)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/node/v/@sppg2001/atomize)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

**Break down stories, build up velocity.**

Atomize is a CLI tool that automatically generates granular tasks from user stories using YAML templates. Streamline your agile workflow with AI-powered task breakdowns, preset templates, and smart estimation distribution.

---

## Features

- **AI-Powered Generation** - Create templates using Google Gemini or local Ollama (completely free)
- **Preset Templates** - Start with battle-tested templates for common workflows
- **Story Learning** - Generate templates by analyzing your existing work items (single or multiple stories)
- **Pattern Detection** - Identify common task patterns across multiple stories with confidence scoring
- **Smart Estimation** - Automatically distribute story points across tasks with conditional percentage support
- **Strict & Lenient Validation** - Flexible QA modes to enforce template quality
- **Azure DevOps Integration** - Native support with WIQL queries and full field mapping
- **Zero Config** - Works out of the box with sensible defaults
- **Interactive Wizards** - User-friendly prompts guide you through everything
- **Built-in Validation** - Catch template errors before they cause problems
- **CI/CD Ready** - Automation-friendly with `--no-interactive` and JSON report output

---

## Installation

### Global Installation (Recommended)

```bash
npm install -g @sppg2001/atomize
```

### Using npx (No Installation)

```bash
npx @sppg2001/atomize --help
```

### Local Development

```bash
git clone https://github.com/Simao-Pereira-Gomes/atomize.git
cd atomize
bun install
bun run dev
```

---

## Quick Start

### 1. Generate Tasks from a Template

```bash
# Use a preset template
atomize generate templates/backend-api.yaml

# Interactive mode (prompts for template and options)
atomize generate
```

### 2. Create Your First Template

```bash
# AI-powered creation (free!)
atomize template create --ai "Backend API with authentication"

# From a preset
atomize template create --preset backend-api

# Learn from one existing story
atomize template create --from-story STORY-123

# Learn from multiple stories (better pattern detection)
atomize template create --from-stories STORY-1,STORY-2,STORY-3

# Step-by-step wizard
atomize template create --scratch
```

### 3. Validate a Template

```bash
# Lenient mode (default) — only hard errors block use
atomize validate templates/my-template.yaml

# Strict mode — warnings also become errors
atomize validate templates/my-template.yaml --strict
```

---

## Usage Guide

### Generate Command

The `generate` command creates tasks in your work item management system based on a template.

```bash
# Basic usage
atomize generate templates/backend-api.yaml

# With options
atomize generate templates/backend-api.yaml \
  --platform azure-devops \
  --execute \
  --verbose

# Dry run (preview only — default behavior)
atomize generate templates/backend-api.yaml --dry-run

# CI/CD mode with JSON report
atomize generate templates/backend-api.yaml \
  --execute \
  --no-interactive \
  --output report.json
```

**Key Options:**
- `--platform <type>` - Platform: `azure-devops` or `mock`
- `--execute` - Actually create tasks (default is dry-run preview)
- `--dry-run` - Preview without creating tasks
- `--continue-on-error` - Keep processing if errors occur
- `--story-concurrency <n>` - Parallel story processing (default: 3, max: 10)
- `--task-concurrency <n>` - Parallel task creation per story (default: 5, max: 20)
- `--verbose` - Show detailed output
- `--no-interactive` - Skip all prompts (for automation)
- `-o, --output <file>` - Write JSON report to file

**Example Output:**
```
✓ Loaded template: Backend API Development
✓ Found 3 matching user stories
✓ Generated 18 tasks (6 per story)
✓ Created 18 tasks in Azure DevOps

Summary:
  Stories processed: 3
  Tasks created: 18
  Execution time: 2.3s
```

### Template Commands

#### Create a Template

```bash
# AI-powered (best for quick starts)
atomize template create --ai "Create template for React component development"

# From preset (fastest)
atomize template create --preset frontend-feature

# Learn from a single story (matches your workflow)
atomize template create --from-story STORY-456 --platform azure-devops

# Learn from multiple stories (best pattern detection)
atomize template create \
  --from-stories STORY-1,STORY-2,STORY-3 \
  --normalize \
  --output my-templates/learned.yaml

# Interactive wizard (most control)
atomize template create --scratch
```

#### List Available Presets

```bash
atomize template list
```

**Available Presets:**
- `backend-api` - Backend API with database integration
- `frontend-feature` - React/Vue UI component development
- `bug-fix` - Bug investigation and resolution workflow
- `fullstack` - Complete full-stack feature

#### Validate a Template

```bash
atomize validate templates/my-template.yaml

# Strict mode — warnings become errors (recommended for team/production templates)
atomize validate templates/my-template.yaml --strict --verbose
```

---

## Template Structure

Templates are YAML files that define how to break down user stories into tasks.

### Basic Template

```yaml
version: "1.0"
name: "Backend API Development"
description: "Standard backend API workflow"

# Which stories to process
filter:
  workItemTypes: ["User Story"]
  states: ["New", "Active"]
  tags:
    include: ["backend", "api"]
  excludeIfHasTasks: true

# Task breakdown
tasks:
  - title: "Design API Endpoints: ${story.title}"
    description: "Design REST API endpoints and schemas"
    estimationPercent: 15
    activity: "Design"
    tags: ["design", "api"]

  - title: "Implement Core Logic: ${story.title}"
    description: "Implement business logic and validation"
    estimationPercent: 40
    activity: "Development"

  - title: "Write Tests"
    description: "Unit and integration tests"
    estimationPercent: 30
    activity: "Testing"

  - title: "Code Review & Documentation"
    description: "Review and document the implementation"
    estimationPercent: 15
    activity: "Documentation"

# Estimation settings
estimation:
  rounding: "nearest"
  minimumTaskPoints: 0.5

# Validation rules
validation:
  totalEstimationMustBe: 100
  minTasks: 3
  maxTasks: 10
```

### Template Features

#### Variable Interpolation

```yaml
- title: "Design: ${story.title}"
- description: "Story ${story.id}: ${story.description}"
```

Available variables: `${story.title}`, `${story.id}`, `${story.description}`, `${story.estimation}`, `${story.tags}`

#### Task Assignment

```yaml
assignTo: "@ParentAssignee"  # Inherit from story
assignTo: "@Me"              # Current user
assignTo: "user@email.com"   # Specific user
```

#### Conditional Tasks

```yaml
- title: "Security Review"
  estimationPercent: 10
  condition: '${story.tags} CONTAINS "security"'
```

#### Conditional Estimation (v1.1)

Adapt task percentage based on story properties. First matching rule wins; `estimationPercent` is the fallback.

```yaml
- title: "Implementation"
  estimationPercent: 50                 # Default
  estimationPercentCondition:
    - condition: '${story.tags} CONTAINS "critical"'
      percent: 60                       # More weight for critical stories
    - condition: "${story.estimation} >= 13"
      percent: 55                       # More work for large stories
```

#### Task Dependencies

```yaml
tasks:
  - id: "design"
    title: "Design Phase"
    estimationPercent: 20

  - id: "implement"
    title: "Implementation"
    estimationPercent: 60
    dependsOn: ["design"]   # Must complete design first
```

---

## AI-Powered Template Creation

Atomize supports two free AI providers:

### Google Gemini (Cloud — Recommended)

1. Get a free API key: https://makersuite.google.com/app/apikey
2. Set environment variable:
   ```bash
   export GOOGLE_AI_API_KEY="your-key-here"
   ```
3. Create templates:
   ```bash
   atomize template create --ai "Backend API with OAuth authentication"
   ```

### Ollama (Local — Complete Privacy)

1. Install Ollama: https://ollama.ai
2. Download a model:
   ```bash
   ollama pull llama3.2
   ```
3. Start the service:
   ```bash
   ollama serve
   ```
4. Create templates:
   ```bash
   atomize template create --ai-provider ollama --ai "Mobile-first React component"
   ```

### AI Tips

- Be specific: "Backend API with JWT auth, rate limiting, and PostgreSQL"
- Mention your tech stack: "React component with TypeScript and Tailwind CSS"
- Specify testing requirements: "Include unit tests and E2E tests"
- Use the refinement loop to iterate: Accept, Refine, Regenerate, or Cancel

---

## Platform Setup

### Azure DevOps

1. **Get a Personal Access Token (PAT)**
   - Go to: `https://dev.azure.com/[your-org]/_usersSettings/tokens`
   - Create token with `Work Items (Read, Write)` scope

2. **Configure Environment Variables**
   ```bash
   export AZURE_DEVOPS_ORG_URL="https://dev.azure.com/your-org"
   export AZURE_DEVOPS_PROJECT="YourProject"
   export AZURE_DEVOPS_PAT="your-personal-access-token"
   ```

3. **Or Use Interactive Setup**
   ```bash
   atomize generate templates/backend-api.yaml
   # CLI will prompt for configuration
   ```

### Mock Platform (Testing)

```bash
atomize generate templates/backend-api.yaml --platform mock
```

No configuration required. Includes 7 built-in sample stories.

---

## Strict vs Lenient Validation

Atomize has two validation modes:

| Mode | Warnings | Best For |
|------|----------|----------|
| **Lenient** (default) | Non-blocking | Development, personal templates |
| **Strict** | Treated as errors | Team templates, CI/CD pipelines |

```bash
# Default (lenient) — only hard errors block use
atomize validate my-template.yaml

# Strict — warnings also fail validation
atomize validate my-template.yaml --strict
```

You can also set the mode in the template itself:
```yaml
validation:
  mode: "strict"
```

---

## Real-World Examples

### Example 1: Backend API Feature

**Story:** "As a user, I want to reset my password via email"

**Generated Tasks:**
1. Design password reset flow and email templates (1.5 pts)
2. Implement password reset endpoint (3.5 pts)
3. Create email service integration (1.5 pts)
4. Write unit and integration tests (2 pts)
5. Add API documentation (0.5 pts)
6. Security review and rate limiting (1 pt)

**Total:** 10 story points perfectly distributed

### Example 2: Multi-Story Learning

```bash
# Learn from your team's best stories
atomize template create \
  --from-stories STORY-100,STORY-115,STORY-132,STORY-148 \
  --platform azure-devops \
  --normalize \
  --output team-templates/backend-standard.yaml

# Validate the learned template
atomize validate team-templates/backend-standard.yaml --strict

# Apply it
atomize generate team-templates/backend-standard.yaml --execute
```

---

## Advanced Usage

### Custom Filters

```yaml
filter:
  workItemTypes: ["User Story", "Bug"]
  states: ["New", "Approved"]
  tags:
    include: ["backend"]
    exclude: ["deprecated"]
  areaPaths: ["MyProject\\Backend\\API"]
  iterations: ["Sprint 23", "Sprint 24"]
  assignedTo: ["john@company.com", "jane@company.com"]
  priority:
    min: 1
    max: 2
  excludeIfHasTasks: true
  customFields:
    - field: "Custom.Team"
      operator: "equals"
      value: "Platform Engineering"
```

### Estimation Settings

```yaml
estimation:
  strategy: "percentage"    # Distribute story points by percentage
  rounding: "nearest"       # nearest, up, down, none
  minimumTaskPoints: 0.5    # Minimum points per task
  ifParentHasNoEstimation: "skip"   # skip, warn, use-default
```

---

## Testing

```bash
# Run all tests
bun test

# Run specific test suite
bun test tests/unit/atomizer.test.ts

# Run with coverage
bun test --coverage

# Watch mode
bun test --watch
```

### Development Setup

```bash
git clone https://github.com/Simao-Pereira-Gomes/atomize.git
cd atomize
bun install
bun run dev
bun test
bun run build
```

---

## Troubleshooting

### "Not authenticated" error

```bash
# Check environment variables are set
echo $AZURE_DEVOPS_PAT

# Or use interactive mode (will prompt)
atomize generate templates/backend-api.yaml
```

### "Template validation failed"

```bash
# Get detailed output
atomize validate templates/my-template.yaml --verbose

# Common issues:
# - Total estimation must equal 100%
# - Task dependencies reference non-existent IDs
# - Missing required fields
```

### "AI provider not available"

```bash
# For Gemini
export GOOGLE_AI_API_KEY="your-key"

# For Ollama
ollama serve          # Must be running
ollama pull llama3.2  # Model must be downloaded
```

---

## Documentation

- [Getting Started](./docs/Getting-Started.md) - First steps and core concepts
- [CLI Reference](./docs/Cli-Reference.md) - Complete command and flag reference
- [Template Reference](./docs/Template-Reference.md) - Full template schema
- [Validation Modes](./docs/Validation-Modes.md) - Strict vs lenient explained
- [Story Learner](./docs/Story-Learner.md) - Generate templates from existing stories
- [Common Validation Errors](./docs/Common-Validation-Errors.md) - Fix validation failures
- [Platform Guide](./docs/Platform-Guide.md) - Azure DevOps setup
- [Template Wizard Guide](./docs/template-wizard-guide.md) - Interactive wizard walkthrough

---

## License

MIT License - see [LICENSE](LICENSE) file for details

## Support

- [Report a Bug](https://github.com/Simao-Pereira-Gomes/atomize/issues)
- [Request a Feature](https://github.com/Simao-Pereira-Gomes/atomize/issues)
- [Discussions](https://github.com/Simao-Pereira-Gomes/atomize/discussions)
