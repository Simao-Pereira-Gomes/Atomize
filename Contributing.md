# Contributing to Atomize

Thank you for your interest in contributing to Atomize! 🎉

We welcome contributions of all kinds: bug reports, feature requests, documentation improvements, code contributions, and more.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Monorepo Architecture](#monorepo-architecture)
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
- Atomize: v2.0.0
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
- **A GitHub Copilot account** (optional, for testing AI-assisted template generation — see [docs/Auth-Guide.md](docs/Auth-Guide.md#ai-drafting-copilot-session))

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

# 5. Run tests
bun test

# 6. Build
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

## Monorepo Architecture

Atomize is a Bun workspace monorepo. `packages/` holds seven packages, split between three release surfaces and four internal shared libraries.

**Release surfaces** — each ships independently with its own release pipeline:
- `packages/cli` — the Atomize CLI, published to npm as `@sppg2001/atomize`. See [docs/adr/0031](docs/adr/0031-cli-release-pipeline.md).
- `packages/vscode-extension` — the VS Code extension, published to the Marketplace. See [docs/adr/0030](docs/adr/0030-extension-release-pipeline.md).
- `packages/atomize-studio` — the desktop app (Tauri), published as platform installers via GitHub Releases. See [docs/adr/0059](docs/adr/0059-studio-release-tags-gate-publishing.md).

**Shared internal libraries** — all `private: true`, workspace-linked, never published on their own:
- `packages/atomize-schema` — Zod-based Atomize YAML schema and validation. No internal dependencies; the base of the graph.
- `packages/atomize-core` — the shared Template Library: composition, platform adapters, services. Depends on `atomize-schema`.
- `packages/atomize-ai` — shared AI template-drafting client, wrapping `@github/copilot-sdk`. No internal atomize dependencies.
- `packages/atomize-sidecar` — a companion process bundled with Atomize Studio, compiled to a standalone binary (`bun build --compile`). Depends on `atomize-core` and `atomize-ai`.

There are two distinct ways a release surface consumes the shared libraries:

1. **Direct embedding.** `cli` and `vscode-extension` both import `atomize-core` as an in-process TypeScript library (`cli` also imports `atomize-ai` directly, for its AI-assisted drafting command). `vscode-extension` moved to this pattern from shelling out to a separately-installed CLI binary — see [docs/adr/0038](docs/adr/0038-atomize-core-shared-library-replaces-cli-subprocess.md) for why.
2. **Companion process.** `atomize-studio`'s frontend is a Tauri webview, not a Node/Bun process, so it can't import `atomize-core`/`atomize-ai` directly. Instead it stages and bundles the `atomize-sidecar` binary and talks to it as a separate OS process over a wire protocol. See [docs/adr/0042](docs/adr/0042-studio-sidecar-wire-protocol.md) and [docs/adr/0034](docs/adr/0034-template-builder-cli-bridge-via-tauri-plugin-shell.md). `atomize-studio` also depends on `atomize-schema` directly in its frontend for client-side validation — that dependency is separate from its sidecar relationship with `atomize-core`/`atomize-ai`.

```
atomize-schema
  └─ atomize-core ─┬─ embedded directly by: cli, vscode-extension
                    └─ embedded (with atomize-ai) inside: atomize-sidecar
                                                              ▲
                                        bundled + spoken to as a
                                        separate process by: atomize-studio
atomize-ai
  ├─ embedded directly by: cli
  └─ embedded inside: atomize-sidecar
```

For the full package-by-package purpose and exports, see each package's own README (`packages/<name>/README.md`).

---

## Project Structure

Each package under `packages/` has its own `src/`, `tests/` (or `__tests__/`), and `dist/`. The two packages most contributors touch day-to-day:

```
atomize/
├── packages/
│   ├── cli/
│   │   ├── src/cli/
│   │   │   ├── index.ts        # Main CLI entry
│   │   │   ├── commands/       # Command implementations
│   │   │   ├── orchestrator/   # Generate workflow orchestration
│   │   │   └── utilities/
│   │   ├── src/config/         # CLI configuration, connection profiles
│   │   └── tests/               # unit/, fixtures/, utils/
│   ├── atomize-core/
│   │   ├── src/core/            # Main orchestration (composition, estimation)
│   │   ├── src/platforms/       # Platform adapters
│   │   │   ├── interfaces/      # Common interfaces (IPlatformAdapter, WorkItem, ...)
│   │   │   ├── adapters/        # Platform implementations (azure-devops/, mock/)
│   │   │   └── platform-factory.ts
│   │   ├── src/templates/       # Template loading, composition, validation
│   │   ├── src/services/        # Services (template catalog, etc.)
│   │   ├── src/utils/
│   │   └── catalog/             # Bundled template catalog (templates/, mixins/)
│   ├── atomize-schema/src/      # Zod schemas
│   ├── atomize-ai/src/          # Copilot SDK client
│   ├── atomize-sidecar/src/     # Studio's companion process
│   ├── vscode-extension/src/
│   └── atomize-studio/src/, src-tauri/
├── docs/                        # Documentation, ADRs
└── examples/                    # Example Atomize YAML templates
```

See [Monorepo Architecture](#monorepo-architecture) above for how these packages relate, and each package's own `README.md` for its specific layout.

### Key Files

- `packages/cli/src/cli/index.ts` - CLI entry point
- `packages/atomize-core/src/core/` - Main task generation and composition logic
- `packages/atomize-core/src/platforms/platform-factory.ts` - Platform abstraction
- `packages/atomize-schema/src/` - Template schema definitions
- `package.json` (root) - Workspace scripts; each package also has its own

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

## Style Guidelines

Formatting and lint rules are enforced by [Biome](https://biomejs.dev/) (`biome.json` at the repo root): tab indentation, double quotes in JavaScript/TypeScript, and `organizeImports` on save. Run it per-package:

```bash
bun run --cwd packages/<name> lint       # check
bun run --cwd packages/<name> lint:fix   # auto-fix
```

Beyond what Biome enforces automatically, see [Code Changes](#code-changes) above for code-quality expectations (naming, comments, tests, type safety).

---

## Adding Features

### New CLI Command

1. Create command file in `packages/cli/src/cli/commands/`
2. Implement using Commander.js
3. Add to main CLI in `packages/cli/src/cli/index.ts`
4. Add tests under `packages/cli/tests/`
5. Update `docs/Cli-Reference.md`

```typescript
// packages/cli/src/cli/commands/export.command.ts
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

1. Create adapter in `packages/atomize-core/src/platforms/adapters/[platform]/`
2. Implement `IPlatformAdapter` interface (`packages/atomize-core/src/platforms/interfaces/`)
3. Add to `platform-factory.ts`
4. Add configuration helper
5. Add tests under `packages/atomize-core/tests/`
6. Document in Platform Guide

`cli` and `vscode-extension` both consume `atomize-core` directly, so a new adapter becomes available to both once it's added there — no per-surface wiring needed. `atomize-studio` picks it up transitively through `atomize-sidecar`, which also depends on `atomize-core` (see [Monorepo Architecture](#monorepo-architecture)).

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
