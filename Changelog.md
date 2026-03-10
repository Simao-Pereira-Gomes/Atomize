# Changelog

All notable changes to Atomize will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- GitHub Issues integration
- Jira Cloud integration
- VS Code extension
- Template inheritance
- Custom estimation formulas

---

## [1.1.0] - 2026-03-09

### Added

#### Conditional Estimation Percentages
- **`estimationPercentCondition`** — new task field that lets each task's weight adapt to story properties at generation time
  - Rules are evaluated in order; first matching condition wins
  - Falls back to `estimationPercent` when no condition matches
  - Resolved percentages (not static fallbacks) are used as the baseline when conditional tasks are skipped, keeping normalization accurate
  - Supports all existing condition operators: `CONTAINS`, `AND`, `OR`, `==`, `!=`, `>`, `<`, `>=`, `<=`

#### Multi-Story Learning
- **`--from-stories <ids>`** flag on `template create` — learn from multiple existing stories at once (comma-separated IDs)
  - Pattern detection groups similar tasks across stories
  - Confidence scoring: high (≥ 70% of stories), medium (40–69%), low (< 40%)
  - Outlier detection flags stories that differ significantly from the group
  - Estimation averaging across non-outlier stories
  - Condition pattern detection suggests conditional task logic based on story tags
  - Tag pattern analysis feeds into generated filter criteria

#### Strict / Lenient Validation Modes
- **`--strict`** flag on `validate` — promotes all warnings to errors; template fails if any warning exists
- **`--lenient`** flag on `validate` — explicit lenient mode (already the default, now available as an explicit flag)
- **`validation.mode`** field in template YAML — set the default mode per template (`"strict"` or `"lenient"`)
- CLI flags override the template's `validation.mode` setting

#### CLI Improvements
- **`--story-concurrency <n>`** on `generate` — control max stories processed in parallel (default: 3, max: 10)
- **`--task-concurrency <n>`** on `generate` — control max tasks created per story in parallel (default: 5, max: 20)
- **`--dependency-concurrency <n>`** on `generate` — control max dependency links created in parallel (default: 5, max: 10)
- **`--no-interactive`** on `generate` and `template create` — skip all prompts for automation and CI/CD use
- **`-o, --output <file>`** on `generate` — write a JSON execution report to a file
- **`-q, --quiet`** on `generate`, `validate`, and `template create` — suppress non-essential output

#### Validation Improvements
- Validation errors now include actionable suggestions (💡 hints) explaining exactly how to fix each issue
- Exit code `1` on `generate` when one or more stories fail processing

#### Documentation
- New: [Validation Modes guide](docs/Validation-Modes.md) — full explanation of strict vs lenient, error vs warning classification, and when to use each
- New: [Story Learner guide](docs/Story-Learner.md) — single and multi-story learning, pattern detection, confidence scoring, tips
- Rewritten: [Template Reference](docs/Template-Reference.md) — complete schema reference (previously contained wrong content)
- Updated: all existing docs to reflect v1.1 flags, features, and corrected command references

### Changed

- **Interactive prompts** migrated from `inquirer` to `@clack/prompts` — improved UI consistency and cross-platform behaviour
- **Validate command** output now distinguishes strict vs lenient context in the result header
- **Generate command** details section shown when `--verbose` is set or there are 5 or fewer stories (previously always shown)
- **`--from-story`** single-story learning unchanged; `--from-stories` is the new multi-story variant

### Fixed

- Conditional task skipping now uses resolved conditional percentages (not static fallbacks) as the normalization baseline, producing accurate estimation distributions
- Improved error messages across all commands with specific, actionable guidance

---

## [0.0.1] - 2024-12-29

###  Initial Release

The first public release of Atomize - a CLI tool for automatically generating tasks from user stories.

### Added

#### Core Features
- **Task Generation Engine** - Intelligent task breakdown from user stories using YAML templates
- **Template System** - Flexible YAML-based template schema with validation
- **Estimation Distribution** - Smart allocation of story points across tasks with multiple rounding strategies
- **Variable Interpolation** - Dynamic task titles and descriptions using `${story.*}` variables
- **Conditional Tasks** - Create tasks conditionally based on story properties

#### Platform Integration
- **Azure DevOps Adapter** - Full integration with Azure DevOps Services
  - WIQL query building from filter criteria
  - Work item creation with all standard fields
  - Custom field support
  - Task linking to parent work items
- **Mock Platform** - Testing adapter with sample data for development

#### Template Creation Methods
- **AI-Powered Generation** 
  - Google Gemini integration (free tier support)
  - Ollama integration (local, completely free)
  - Interactive refinement loop
- **Preset Templates** 
  - `backend-api` - Backend API development workflow
  - `frontend-feature` - React/Vue UI component workflow
  - `bug-fix` - Bug investigation and resolution workflow
- **Story Learning** - Generate templates by analyzing existing work items with tasks
- **Interactive Wizard** - Step-by-step template builder with prompts

#### CLI Commands
- `generate` (alias: `gen`) - Generate tasks from templates
  - Dry run mode for safe preview
  - Continue-on-error option for batch processing
  - Verbose output mode
- `validate` - Template validation with detailed error messages
- `template create` - Multiple creation modes (AI, preset, story learning, wizard)
- `template list` (alias: `ls`) - List available presets

#### Configuration
- **Environment Variables** - Configuration via `.env` or environment
- **Interactive Prompts** - Fallback to interactive configuration when needed
- **Multiple Platforms** - Platform selection via CLI flag

#### Features
- **Filter Engine** - Complex filtering with multiple criteria
  - Work item types
  - States
  - Tags (include/exclude)
  - Area paths
  - Iterations
  - Assigned users
  - Priority ranges
  - Custom fields
  - Custom queries (WIQL for Azure DevOps)
- **Task Assignment Patterns**
  - `@ParentAssignee` / `@Inherit` - Inherit from parent story
  - `@Me` - Assign to current user
  - `@Unassigned`
  - Specific email addresses
- **Task Dependencies** - Define execution order between tasks
- **Estimation Strategies**
  - Percentage-based (default)
- **Rounding Options** - Nearest, up, down, or no rounding
- **Validation Rules** - Template validation with configurable constraints
  - Total estimation requirements
  - Task count limits
  - Custom validation rules

#### Developer Experience
- **TypeScript** - Full type safety throughout codebase
- **Comprehensive Testing** - 160+ tests covering all major components
  - Unit tests
  - Integration tests
  - End-to-end tests
- **Error Handling** - Custom error types with helpful messages
- **Logging** - Configurable logging with Winston
- **Cross-Platform** - Windows, macOS, and Linux support

#### Documentation
- **Getting Started Guide** - Quick start for new users
- **CLI Reference** - Complete command documentation
- **Template Reference** - Full YAML schema documentation
- **Platform Guide** - Platform setup and configuration
- **Inline Help** - Contextual help for all commands

### Technical Details

#### Architecture
- Platform abstraction layer for extensibility
- Filter engine for cross-platform query translation
- Estimation calculator with multiple strategies
- Template loader with validation
- Modular command structure

#### Dependencies
- Bun runtime for fast execution
- Commander.js for CLI framework
- Inquirer.js for interactive prompts
- Azure DevOps Node API for platform integration
- Google Generative AI for Gemini support
- Zod for schema validation
- Winston for logging

#### Build & Distribution
- npm package published as `@sppg2001/atomize`
- Global CLI installation support
- Cross-platform executables
- TypeScript compilation
- Automated build scripts

### Fixed

N/A - Initial release

### Changed

N/A - Initial release

### Deprecated

N/A - Initial release

### Removed

N/A - Initial release

### Security

- Secure credential handling
- PAT token validation
- Environment variable sanitization
- No credentials stored in templates

---

## Version History

- **[1.1.0]** - 2026-03-09 - Conditional estimation, multi-story learning, strict/lenient validation modes
- **[0.0.1]** - 2024-12-29 - Initial release

---

## Contributing

See [Contributing.md](Contributing.md) for information on how to contribute to this project.

## Links

- [Repository](https://github.com/Simao-Pereira-Gomes/atomize)
- [npm Package](https://www.npmjs.com/package/@sppg2001/atomize)
- [Issue Tracker](https://github.com/Simao-Pereira-Gomes/atomize/issues)
- [Documentation](docs/)

---

[Unreleased]: https://github.com/Simao-Pereira-Gomes/atomize/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/Simao-Pereira-Gomes/atomize/compare/v0.0.1...v1.1.0
[0.0.1]: https://github.com/Simao-Pereira-Gomes/atomize/releases/tag/v0.0.1