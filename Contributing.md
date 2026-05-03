# Contributing to Atomize

Thank you for your interest in contributing to Atomize! 🎉

We welcome contributions of all kinds: bug reports, feature requests, documentation improvements, code contributions, and more.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Style Guidelines](#style-guidelines)
- [Adding Features](#adding-features)

---

## Code of Conduct

This project adheres to a code of conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

**In short:**
- Be respectful and inclusive
- Be patient and welcoming
- Be collaborative
- Focus on what is best for the community

---

## How Can I Contribute?

### 🐛 Reporting Bugs

**Before submitting a bug report:**
1. Check the [existing issues](https://github.com/Simao-Pereira-Gomes/atomize/issues) to avoid duplicates
2. Verify you're using the latest version: `atomize --version`
3. Test with the mock platform to isolate the issue

**When submitting a bug report, include:**
- Clear, descriptive title
- Steps to reproduce the issue
- Expected vs actual behavior
- Your environment (OS, Node/Bun version, platform)
- Error messages and logs (use `--verbose` flag)
- Template file (if relevant)

**Example:**
```markdown
**Bug Description**
Template validation fails with custom field filters

**Steps to Reproduce**
1. Create template with customFields filter
2. Run `atomize validate template.yaml`
3. See error: "Invalid filter"

**Expected Behavior**
Template should validate successfully

**Environment**
- OS: macOS 14.0
- Node: v20.10.0
- Atomize: v2.0.0-alpha.0
- Platform: Azure DevOps
```

### 💡 Suggesting Features

**Before suggesting a feature:**
1. Check [existing feature requests](https://github.com/Simao-Pereira-Gomes/atomize/issues?q=is%3Aissue+is%3Aopen+label%3Aenhancement)
2. Consider if it fits Atomize's scope
3. Think about how it would work with existing features

**When suggesting a feature, include:**
- Clear use case and problem it solves
- Proposed solution (if you have one)
- Alternative solutions you've considered
- Example usage (CLI commands, template syntax, etc.)

### 📝 Improving Documentation

Documentation improvements are highly valued!

**Types of documentation contributions:**
- Fix typos, grammar, or clarity issues
- Add examples and use cases
- Improve getting started guides
- Add troubleshooting tips

**Process:**
1. Fork the repository
2. Edit markdown files in `docs/` or root directory
3. Preview changes locally
4. Submit a pull request

### 🎨 Adding Bundled Templates

Bundled templates are templates that ship with Atomize.

**Good bundled templates:**
- Solve a common, real-world use case
- Have clear, descriptive names
- Include comprehensive documentation
- Are well-tested with real stories

**Process:**
1. Create the template in `templates/templates/`
2. Add reusable task groups in `templates/mixins/` when appropriate
3. Add tests
4. Update documentation

**Template checklist:**
- [ ] Clear name and description
- [ ] Includes all standard fields
- [ ] Uses meaningful task titles
- [ ] Includes examples in metadata
- [ ] Has proper activity types
- [ ] Tested with real work items

### 🔌 Adding Platform Adapters

Want to add support for Jira, GitHub, or another platform?

**Requirements:**
- Implement `IPlatformAdapter` interface
- Handle authentication
- Map platform fields to `WorkItem` interface
- Support work item querying and task creation
- Include comprehensive tests
- Document setup process

**See [Platform Guide](docs/Platform-Guide.md#adding-new-platforms) for detailed instructions.**

---

## Development Setup

### Prerequisites

- **Bun** v1.0+ (recommended) or Node.js 18+
- **Git**
- **Azure DevOps account** (optional, for testing)
- **GitHub Models access** (optional, for AI-assisted template generation)

### Initial Setup

```bash
# 1. Fork the repository
# Click "Fork" on GitHub

# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/atomize.git
cd atomize

# 3. Add upstream remote
git remote add upstream https://github.com/Simao-Pereira-Gomes/atomize.git

# 4. Install dependencies
bun install

# 5. Create .env file (optional)
cp .env.example .env
# Edit .env with your configuration

# 6. Run tests
bun test

# 7. Build
bun run build
```

### Development Workflow

```bash
# Run in development mode
bun run dev

# Run specific command
bun run src/cli/index.ts generate template:backend-api --platform mock

# Watch tests
bun test --watch

# Type checking
bun run typecheck

# Run all checks
bun run check
```

---

## Project Structure

```
atomize/
├── src/
│   ├── cli/              # CLI entry points and commands
│   │   ├── index.ts      # Main CLI entry
│   │   └── commands/     # Command implementations
│   ├── core/             # Core business logic
│   │   ├── atomizer.ts   # Main orchestration
│   │   ├── estimation-calculator.ts
│   │   └── filter-engine.ts
│   ├── platforms/        # Platform adapters
│   │   ├── interfaces/   # Common interfaces
│   │   ├── adapters/     # Platform implementations
│   │   └── platform-factory.ts
│   ├── templates/        # Template system
│   │   ├── schema.ts     # Zod schemas
│   │   ├── loader.ts     # Template loading
│   │   └── validator.ts  # Template validation
│   ├── services/         # Services (AI, template catalog, etc.)
│   │   └── template/     # Template services
│   ├── config/           # Configuration
│   └── utils/            # Utilities
├── templates/            # Bundled template catalog
│   ├── templates/        # Bundled templates
│   └── mixins/           # Bundled mixins
├── tests/                # Test files
│   ├── unit/             # Unit tests
│   ├── integration/      # Integration tests
│   └── fixtures/         # Test data
├── docs/                 # Documentation
└── dist/                 # Build output
```

### Key Files

- `src/cli/index.ts` - CLI entry point
- `src/core/atomizer.ts` - Main task generation logic
- `src/platforms/platform-factory.ts` - Platform abstraction
- `src/templates/schema.ts` - Template schema definitions
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration

---

## Making Changes

### Branch Strategy

```bash
# Update your fork
git checkout main
git fetch upstream
git merge upstream/main

# Create feature branch
git checkout -b feature/your-feature-name

# Or bug fix branch
git checkout -b fix/bug-description
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Build process or tooling changes

**Examples:**
```bash
feat(cli): add --output flag to template create command

fix(azure-devops): handle null assignee field correctly

docs(readme): add troubleshooting section

test(atomizer): add tests for estimation distribution

refactor(filter-engine): simplify WIQL query building
```

### Code Changes

1. **Write clean, readable code**
   - Use descriptive variable names
   - Add comments for complex logic
   - Follow existing code style

2. **Add tests**
   - Unit tests for new functions
   - Integration tests for features
   - Maintain >80% code coverage

3. **Update documentation**
   - Update relevant docs in `docs/`
   - Add JSDoc comments to functions
   - Update README if needed

4. **Type safety**
   - Use TypeScript strictly
   - Avoid `any` type
   - Add proper interfaces

---

## Testing

### Running Tests

```bash
# All tests
bun test

# Specific test file
bun test tests/unit/atomizer.test.ts

# With coverage
bun test --coverage

# Watch mode
bun test --watch

# Type checking
bun run typecheck
```

## Submitting Changes

### Pull Request Process

1. **Update your branch**
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Run checks**
   ```bash
   bun run check  # Runs typecheck and tests
   ```

3. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

4. **Create Pull Request**
   - Go to GitHub and click "New Pull Request"
   - Fill out the PR template
   - Link related issues

### PR Title Format

```
<type>(<scope>): <description>
```

Examples:
- `feat(cli): add template export command`
- `fix(azure-devops): resolve authentication timeout`
- `docs: add Jira setup guide`

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Refactoring
- [ ] Other (describe)

## Changes Made
- Change 1
- Change 2
- Change 3

## Testing
- [ ] Added unit tests
- [ ] Added integration tests
- [ ] Tested manually with mock platform
- [ ] Tested manually with Azure DevOps

## Documentation
- [ ] Updated relevant documentation
- [ ] Added code comments
- [ ] Updated CHANGELOG.md

## Screenshots (if applicable)
[Add screenshots or GIFs]

## Related Issues
Fixes #123
Related to #456
```

### Review Process

1. Automated checks will run (tests, linting)
2. Maintainers will review your code
3. Address feedback if requested
4. Once approved, PR will be merged

---


## Adding Features

### New CLI Command

1. Create command file in `src/cli/commands/`
2. Implement using Commander.js
3. Add to main CLI in `src/cli/index.ts`
4. Add tests
5. Update documentation

```typescript
// src/cli/commands/export.command.ts
import { Command } from "commander";

export const exportCommand = new Command("export")
  .description("Export template to different format")
  .argument("<template>", "Template file")
  .option("-f, --format <type>", "Export format", "json")
  .action(async (template, options) => {
    // Implementation
  });
```

### New Platform Adapter

1. Create adapter in `src/platforms/adapters/[platform]/`
2. Implement `IPlatformAdapter` interface
3. Add to platform factory
4. Add configuration helper
5. Add tests
6. Document in Platform Guide

See [Platform Guide - Adding New Platforms](docs/Platform-Guide.md#adding-new-platforms)

---

## Questions?

- 💬 [Start a Discussion](https://github.com/Simao-Pereira-Gomes/Atomize/discussions)
- 📧 Open an issue for specific questions
- 📖 Check the [documentation](docs/)

---

## Recognition

Contributors will be recognized in:
- GitHub contributors page
- CHANGELOG.md (for significant contributions)
- Project README (for major features)

---

Thank you for contributing to Atomize!
