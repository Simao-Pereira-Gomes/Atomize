# `template list --json` contract and cross-kind lineage resolution

`atomize template list --json` writes a JSON array of `TemplateCatalogItem`-shaped objects to stdout (progress to stderr), following the convention established by `fields list --json` and `queries list --json`. The Catalog Browser extension command depends on this contract to open and reference Atomize YAML files without a separate discovery step.

## Contract shape

Each item carries identifying fields (`name`, `ref`, `scope`, `kind`, `path`, etc.); shadowed items add an `overrides` object. Resolvable Template items additionally carry the full Resolved Template payload — the key decision being that this lets Template Builder's Catalog clone Starting Path load a source Template through the CLI's JSON interface rather than reading a Catalog path from the WebView, and that composition failures degrade to metadata-only rather than dropping the item from the Catalog. Unresolvable Template Lineage (`origin` declared but its target absent from the catalog) is silently omitted, consistent with ADR-0010's treatment in human output. Exact field shapes live in the `TemplateCatalogItem` type, not here.

## Cross-kind lineage resolution

`buildLineage` previously keyed its lookup by bare `name` (stripping the `kind:` prefix) against a single-kind item map. Two bugs followed: cross-kind `origin` refs (e.g. a template declaring `origin: "mixin:foo"`) were silently dropped, and the bare-name lookup was ambiguous when a template and mixin shared the same stem.

The fix keys the lookup by full `ref` (`kind:name`) against a combined map. Because fetching both kinds solely to resolve lineage on a single-kind call would be wasteful, cross-kind resolution is scoped to `listAllWithOverrides()` — a new `TemplateCatalog` method that fetches templates and mixins in parallel, builds a unified ref map, and resolves lineage across both. `TemplateLibrary` exposes this as `getCatalogAll()`. The per-kind `listWithOverrides` path is unchanged and continues to resolve only within-kind lineage; `--json` without `--type` uses `getCatalogAll()`, while `--json --type <kind>` uses the existing per-kind path.

**Considered:** fixing `buildLineage` inside `listWithOverrides` by always double-fetching the other kind — rejected because it would double the I/O on every single-kind call (template wizard, ref resolution, install commands) with no benefit for those callers.
