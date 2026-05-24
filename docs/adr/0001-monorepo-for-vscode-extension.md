# Monorepo structure for the VS Code extension

The repo started as a single-package CLI. Adding a VS Code extension requires a separate build pipeline (esbuild to CJS, targeting the extension host) and a separate `package.json` with its own `engines.vscode` declaration — constraints that can't coexist cleanly with the CLI's Bun-native ESM build.

Rather than treating the extension as an ad-hoc sibling directory, we added `"workspaces": ["packages/*"]` to the root `package.json`. Bun handles workspace installs natively, hoisting shared devDependencies and letting each package declare its own build scripts without touching the root.

**Considered options:** A flat layout with no workspace linkage was simpler upfront, but would require a manual `bun install` in the extension directory in every CI job that touches it, and would give Bun no visibility into cross-package script orchestration.
