# Atomize

[![CI](https://github.com/Simao-Pereira-Gomes/atomize/actions/workflows/ci.yml/badge.svg)](https://github.com/Simao-Pereira-Gomes/atomize/actions/workflows/ci.yml)
[![Code Quality](https://github.com/Simao-Pereira-Gomes/atomize/actions/workflows/code-quality.yml/badge.svg)](https://github.com/Simao-Pereira-Gomes/atomize/actions/workflows/code-quality.yml)
[![NPM Version](https://img.shields.io/npm/v/@sppg2001/atomize)](https://www.npmjs.com/package/@sppg2001/atomize)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/node/v/@sppg2001/atomize)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)


**Break down stories, build up velocity.**

Atomize is a CLI tool that automatically generates granular tasks from user stories using  YAML templates. Streamline your agile workflow with AI-powered task breakdowns, preset templates, and smart estimation distribution.

---

##  Features

- **🤖 AI-Powered Generation** - Create templates using Google Gemini or local Ollama (completely free)
- **📋 Preset Templates** - Start with battle-tested templates for common workflows
- **🧠 Story Learning** - Generate templates by analyzing your existing work items
- **🎯 Smart Estimation** - Automatically distribute story points across tasks
- **🔗 Azure DevOps Integration** - Native support with more platforms coming soon
- **⚡ Zero Config** - Works out of the box with sensible defaults
- **🎨 Interactive Wizards** - User-friendly prompts guide you through everything
- **✅ Built-in Validation** - Catch template errors before they cause problems

---

## 📦 Installation

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

## 🎯 Quick Start

### 1. Generate Tasks from a Template

```bash
# Use a preset template
atomize generate templates/backend-api.yaml

# Interactive mode
atomize generate
```

### 2. Create Your First Template

```bash
# AI-powered creation (free!)
atomize template create --ai "Backend API with authentication"

# From a preset
atomize template create --preset backend-api

# Learn from an existing story
atomize template create --from-story STORY-123

# Step-by-step wizard
atomize template create --scratch
```

### 3. Validate a Template

```bash
atomize validate templates/my-template.yaml
```

---

## 📖 Usage Guide

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

# Dry run (preview only)
atomize generate templates/backend-api.yaml --dry-run
```

**Options:**
- `--platform <type>` - Platform to use (azure-devops, mock)
- `--execute` - Actually create tasks (default is dry-run)
- `--dry-run` - Preview without creating tasks
- `--continue-on-error` - Keep processing if errors occur
- `--verbose` - Show detailed output

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
# best for quick starts
atomize template create --ai "Create template for React component development"

# From preset (fastest)
atomize template create --preset frontend-feature

# Learn from story in your platform
atomize template create --from-story STORY-456 --platform azure-devops

# Interactive wizard
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

# With detailed output
atomize validate templates/my-template.yaml --verbose
```

---

## 🏗️ Template Structure

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
    tags: ["implementation"]

  - title: "Write Tests"
    description: "Unit and integration tests"
    estimationPercent: 30
    activity: "Testing"
    tags: ["testing"]

  - title: "Code Review & Documentation"
    description: "Review and document the implementation"
    estimationPercent: 15
    activity: "Documentation"
    tags: ["review", "docs"]

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
Use story data in task titles and descriptions:
- `${story.title}` - Story title
- `${story.id}` - Story ID
- `${story.description}` - Story description

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

#### Task Dependencies
```yaml
tasks:
  - id: "design"
    title: "Design Phase"
    estimationPercent: 20

  - id: "implement"
    title: "Implementation"
    estimationPercent: 60
    dependsOn: ["design"]  # Must complete design first
```

---

##  AI-Powered Template Creation

Atomize supports two free AI providers for template generation:

### Google Gemin

1. Get a free API key: https://makersuite.google.com/app/apikey
2. Set environment variable:
   ```bash
   export GOOGLE_AI_API_KEY="your-key-here"
   ```
   For windows
  ```bash
    set GOOGLE_AI_API_KEY=your-key
  ```
4. Create templates:
   ```bash
   atomize template create --ai "Backend API with OAuth authentication"
   ```

### Ollama (Local)

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
- Specify testing requirements: "Include unit tests and E2E tests"
- Refine iteratively: Use the refine option to adjust the generated template

---

##  Platform Setup

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
   For Windows
    ```bash
   set AZURE_DEVOPS_ORG_URL="https://dev.azure.com/your-org"
   set AZURE_DEVOPS_PROJECT="YourProject"
   set AZURE_DEVOPS_PAT="your-personal-access-token"
   ```

4. **Or Use Interactive Setup**
   ```bash
   atomize generate templates/backend-api.yaml
   # CLI will prompt for configuration
   ```

### Mock Platform (Testing)

```bash
atomize generate templates/backend-api.yaml --platform mock
```

---

##  Real-World Examples

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

## 🛠️ Advanced Usage

### Custom Filters

Filter stories with precise criteria:

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
```

### Learning from Existing Stories

```bash
# Analyze a story and create a template
atomize template create --from-story STORY-123

# With percentage normalization
atomize template create --from-story STORY-123 --normalize

# Keep original percentages
atomize template create --from-story STORY-123 --no-normalize
```

---

##  Testing

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
# Clone the repository
git clone https://github.com/Simao-Pereira-Gomes/atomize.git
cd atomize

# Install dependencies
bun install

# Run in development mode
bun run dev

# Run tests
bun test

# Build
bun run build
```

---

## 📝 Roadmap

### v0.1.0 - Initial Release ✅
- [x] Core task generation engine
- [x] Azure DevOps integration
- [x] AI-powered template creation
- [x] Preset templates
- [x] Story learning
- [x] Interactive wizards
---

##  Troubleshooting

### Common Issues

**"Not authenticated" error**
```bash
# Make sure environment variables are set
echo $AZURE_DEVOPS_PAT

# Or use interactive mode
atomize generate --interactive
```

**"Template validation failed"**
```bash
# Check your template
atomize validate templates/my-template.yaml --verbose

# Common issues:
# - Total estimation must equal 100%
# - Task dependencies reference non-existent IDs
# - Missing required fields
```

**AI provider not available**
```bash
# For Gemini
export GOOGLE_AI_API_KEY="your-key"
set GOOGLE_AI_API_KEY="your-key"

# For Ollama
ollama serve  # Must be running
ollama pull llama3.2  # Model must be downloaded
```

---

## License

MIT License - see [LICENSE](LICENSE) file for details

##  Support

- [Report a Bug](https://github.com/Simao-Pereira-Gomes/atomize/issues)
- [Request a Feature](https://github.com/Simao-Pereira-Gomes/atomize/issues)
- [Discussions](https://github.com/Simao-Pereira-Gomes/atomize/discussions)
