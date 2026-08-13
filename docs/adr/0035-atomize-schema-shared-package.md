# `packages/atomize-schema`: shared Zod schema and graph utilities

The Template Builder needs the same Zod schema types (`TaskTemplate`, `FilterCriteria`, `TaskDefinition`, etc.) that the CLI already owns. Duplicating them would create schema drift; importing directly from the CLI package was rejected because the CLI has no public type export and its `schema.ts` uses internal `@/` path aliases that don't resolve outside its own tsconfig context.

**Chosen approach: a new `packages/atomize-schema` package** containing the Zod schemas, derived TypeScript types, and the `graph.ts` dependency utility. Both the CLI and the Template Builder declare it as a workspace dependency. The CLI removes its own copies of these files and imports from the shared package instead.

This keeps the canonical schema definition in one place, makes the data model a first-class package, and avoids any coupling between the Template Builder and CLI runtime code.

**Still true post-ADR-0038:** `@sppg2001/atomize-core` (the extracted runtime package) depends on `atomize-schema` — `templates/schema.ts` is already a re-export of it — rather than absorbing it. Atomize Studio's frontend is a browser webview that imports `atomize-schema` directly today; `atomize-core` is Node-only (filesystem, platform SDKs, credential-injection logic), so merging the two would pull Node-only code into a browser bundle for no reason. The split stays live, not just historical.

## Considered options

**Subpath export from the CLI** (`"exports": { "./schema": "./src/templates/schema.ts" }`): exposes types without a new package, but still requires resolving the internal `@/utils/graph.js` alias from outside the CLI's tsconfig, and it conflates a binary package with a library API.

**Relative path imports**: reaches directly into `../../cli/src/templates/schema.ts`. Works without any package changes but creates invisible coupling — the import path breaks silently on directory moves and gives no indication that the dependency is intentional.
