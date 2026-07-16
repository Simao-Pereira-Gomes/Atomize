# `template list --json` contract and cross-kind lineage resolution

`atomize template list --json` writes a JSON array of `TemplateCatalogItem`-shaped objects to stdout (progress to stderr), following the convention established by `fields list --json` and `queries list --json`. The Catalog Browser extension command depends on this contract to open and reference Atomize YAML files without a separate discovery step.

## Contract shape

Each item in the array carries: `name`, `displayName`, `description`, `ref`, `scope`, `kind`, and `path`. Items that participate in a Catalog Override include an `overrides` object — `{ name, ref, scope, path }` — for the shadowed entry. The `ref` field is included in `overrides` (beyond what the spec strictly required) because the extension uses catalog refs as canonical identifiers everywhere; reconstructing `ref` from `kind` + `name` at every call site is unnecessary friction.

Resolvable Template items additionally carry a `template` field containing the Resolved Template payload. This allows the Template Builder's Catalog clone Starting Path to load the selected source Template through the CLI's JSON interface, rather than reading a Catalog path from the WebView. A Template whose composition cannot resolve remains listed as Catalog metadata but omits this payload, so consumers can exclude it without making the whole Catalog unavailable. A clone materialises inherited and Mixin-contributed content, then removes its `extends` and `mixins` declarations before it becomes editable; native composition authoring is not part of the Builder's initial scope. Mixin items omit this field because the Template Builder does not author Mixins.

Items with a resolved Template Lineage include an `origin` object — `{ ref, scope }`. Unresolvable lineage (the `origin` field is declared in the YAML but the referenced item is absent from the catalog) is **silently omitted**, consistent with ADR-0010's treatment in the human output. Partial objects with a missing `scope` are never emitted.

Items are sorted alphabetically by `ref` within each kind, with all templates before all mixins.

## Cross-kind lineage resolution

`buildLineage` previously keyed its lookup by bare `name` (stripping the `kind:` prefix) against a single-kind item map. Two bugs followed: cross-kind `origin` refs (e.g. a template declaring `origin: "mixin:foo"`) were silently dropped, and the bare-name lookup was ambiguous when a template and mixin shared the same stem.

The fix keys the lookup by full `ref` (`kind:name`) against a combined map. Because fetching both kinds solely to resolve lineage on a single-kind call would be wasteful, cross-kind resolution is scoped to `listAllWithOverrides()` — a new `TemplateCatalog` method that fetches templates and mixins in parallel, builds a unified ref map, and resolves lineage across both. `TemplateLibrary` exposes this as `getCatalogAll()`. The per-kind `listWithOverrides` path is unchanged and continues to resolve only within-kind lineage; `--json` without `--type` uses `getCatalogAll()`, while `--json --type <kind>` uses the existing per-kind path.

**Considered:** fixing `buildLineage` inside `listWithOverrides` by always double-fetching the other kind — rejected because it would double the I/O on every single-kind call (template wizard, ref resolution, install commands) with no benefit for those callers.
