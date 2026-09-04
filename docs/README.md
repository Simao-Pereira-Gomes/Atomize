# Atomize Documentation

Start with the repository [README](../README.md) if you are new to Atomize. It is the canonical onboarding path, with parallel quickstarts for VS Code, Atomize Studio, and the CLI.

## Start Here

- [README](../README.md) - What Atomize does, install, first workflow per surface, safety model, and key links
- [Workflows](./Workflows.md) - Task-oriented guide across VS Code, Atomize Studio, and CLI
- [VS Code Extension](./VS-Code-Extension.md) - Editor command, setting, and behavior reference
- [Atomize Studio](./Atomize-Studio.md) - Desktop app Studio Area, setting, and behavior reference

## References

- [CLI Reference](./Cli-Reference.md) - Complete command and flag reference
- [Template Reference](./Template-Reference.md) - Full Atomize YAML schema and semantics
- [Auth Guide](./Auth-Guide.md) - Connection profiles, credential storage, token rotation, and CI setup
- [Validation Modes](./Validation-Modes.md) - Lenient vs strict validation
- [Common Validation Errors](./Common-Validation-Errors.md) - How to fix common template failures
- [Platform Guide](./Platform-Guide.md) - Azure DevOps, Mock, and platform concepts

## Advanced Features

- [Template Creation](./Template-Creation.md) - Catalog, wizard, direct authoring, AI-assisted drafts, and mixins
- [Story Learner](./Story-Learner.md) - Generate templates from existing stories and child tasks

## Compatibility Pages

These paths are kept for older links and should stay short:

- [Getting Started](./Getting-Started.md) - Points to the README and Workflows guide
- [Template Wizard Guide](./template-wizard-guide.md) - Points to Template Creation

## Architecture And Contributor Notes

- [Architecture Decision Records](./adr/README.md) - Indexed by theme: design decisions for CLI, templates, Atomize Studio, and VS Code extension behavior
- [Agent Docs](./agents/) - Issue tracker, labels, and domain-doc conventions for repo automation

## Documentation Ownership

- `README.md` is the canonical onboarding path.
- `docs/Workflows.md` is the canonical workflow guide.
- `docs/Cli-Reference.md` is the command and flag reference.
- `docs/VS-Code-Extension.md` is the VS Code behavior reference.
- `docs/Atomize-Studio.md` is the Atomize Studio behavior reference.
- `docs/Template-Reference.md` is the YAML schema and semantics reference.
- `docs/Template-Creation.md` owns template creation workflows.
- `docs/Auth-Guide.md` owns credential storage and profile behavior.
- Compatibility stubs should not grow new content.

When adding docs, prefer linking to the canonical owner instead of repeating the same workflow in multiple files.
