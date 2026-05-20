# Origin-based template lineage alongside name-based override detection

## Context

Catalog override detection is name-based: two catalog items with the same stem name in different scopes are treated as one logical template, with the higher-priority scope (project > user > built-in) winning. This works for true shadowing but misses the case where a user derives a template from a built-in under a different name — a flat copy or an extends-based template that uses a distinct ref. The relationship is invisible in `atomize template list`, and users have no way to signal "this template started from that one."

The `extends` field already carries origin information for inheritance-link templates. Flat copies carry no such signal today.

## Decision

1. Add an optional `origin` field to both `TaskTemplateBaseSchema` and `MixinTemplateSchema`. Its value is a catalog ref (`template:<name>` or `mixin:<name>`). The field is informational only — it never affects how refs are resolved and does not shadow the origin item.

2. When the create wizard produces a flat copy, automatically write `origin: "template:<name>"` (or `mixin:<name>`) into the saved YAML. No user action required.

3. `atomize template list` reads the `origin` field during catalog scanning and displays it as `↖ based on: <scope> <ref>` in a muted colour (distinct from but close to gray — not yellow or red) below the item's regular metadata lines.

4. Name-based override detection (`⚠ overrides:`) is kept unchanged. Shadowing and lineage are distinct relationships that coexist in the list output.

## Consequences

- The schema gains one new optional field per item type; existing templates are unaffected.
- Flat copies created through the wizard automatically record provenance with no extra author effort.
- Hand-authored templates can declare lineage by adding `origin:` manually.
- If the origin ref no longer exists in the catalog, the lineage line is silently omitted — `origin` is advisory, not a hard dependency.
- `atomize template list` distinguishes two distinct relationships: replacement (same name, `⚠ overrides:`) and derivation (different name, `↖ based on:`).
