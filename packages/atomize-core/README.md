# Atomize Core

The shared Template/platform/composition library: Template discovery and composition (`extends`/`mixins`), platform adapters, Task generation, and the validation/services layer that the CLI, VS Code extension, and Atomize Studio (via the sidecar) all consume. Depends on `atomize-schema`.

## Exports

```json
{
  ".": "./src/index.ts",
  "./core/*": "./src/core/*.ts",
  "./platforms/*": "./src/platforms/*.ts",
  "./services/*": "./src/services/*.ts",
  "./templates/*": "./src/templates/*.ts",
  "./utils/*": "./src/utils/*.ts"
}
```

Root export (`.`) surfaces the main entry points: `Atomizer` (task generation), `TemplateLibrary` (discovery/composition/persistence), `PlatformFactory`, Azure DevOps connection-field helpers, and the shared `logger`.

Subpath exports let consumers reach into a specific area without importing everything:
- `core/*` — generation engine (`Atomizer`, condition evaluation, dependency resolution, estimation).
- `platforms/*` — platform adapters and capability interfaces (Azure DevOps today).
- `services/*` — the template services layer.
- `templates/*` — composition (`extends`/`mixins`), loading, source resolution, schema.
- `utils/*` — errors, graph, math, estimation-normalizer helpers.

## Consumers

- `cli` — embeds this directly (in-process).
- `vscode-extension` — embeds this directly (in-process); see [ADR-0038](../../docs/adr/0038-atomize-core-shared-library-replaces-cli-subprocess.md) for why the extension moved off shelling out to a separately-installed CLI.
- `atomize-sidecar` — embeds this directly; it's how Atomize Studio reaches Template Library logic, since Studio itself does not depend on `atomize-core` as a JS package (see `atomize-sidecar`'s README).

## Scripts

```bash
bun run typecheck
bun test              # all tests
bun test:unit
bun test:integration
bun test:watch
```
