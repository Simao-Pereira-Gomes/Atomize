# Atomize Schema

The Zod schema for the Atomize YAML File format, plus the shared graph and estimation-normalization utilities built on top of it. This is the base package of the monorepo — it has no dependency on any other `@sppg2001/atomize-*` package.

## Exports

Single entry point (`.`), re-exporting:

- `schema.ts` — the Zod schema for a Template/Mixin Atomize YAML File.
- `graph.ts` — shared graph utilities (e.g. dependency-graph traversal used by composition/validation).
- `estimation-normalizer.ts` — shared percentage/estimation normalization logic.

## Consumers

- `atomize-core` (direct dependency)
- `cli` (direct dependency)
- `atomize-studio` (direct dependency, used in its frontend)
- `atomize-sidecar` and `vscode-extension` (transitively, through `atomize-core`)

## Scripts

```bash
bun run typecheck
```

No build step — consumers import the TypeScript source directly (`"." : "./src/index.ts"`).
