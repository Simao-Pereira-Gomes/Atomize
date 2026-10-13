# The Schema Reference is a custom viewer fed by the generated JSON Schema with `x-atomize-*` extensions

Readers need a browsable, OpenAPI-style view of what a valid Atomize YAML File may contain. Field-by-field facts in the hand-written `Template-Reference.md` tables also drift from the Zod schema. The decision: the **Schema Reference** is rendered by a custom viewer in a new package, `packages/atomize-schema-reference`. The package holds a framework-free tree builder and a Solid component, and Atomize Studio, the VS Code extension and the website all embed the same component. It reads the JSON Schema that `generate-schema` already produces. That file moves into the new package, so the editor's schema and the Schema Reference read the same bytes.

Facts that JSON Schema can't express are attached to Zod fields with `.meta()` and flow through generation as extension keywords:
- `x-atomize-rules`: runtime-only rules enforced in `superRefine`, such as unique task IDs, dependency cycles and the repeat cap.
- `x-atomize-guide`: the anchor of the Template Reference section that explains the field.
- The standard `examples` keyword, used sparingly.

A small list in the package covers whole-file rules that belong to no single field. Tests check that every `x-atomize-guide` anchor exists as a heading, that every example validates against its field, and that every listed rule path exists in the tree. The field tables are removed from `Template-Reference.md`. It keeps the behaviour and the examples, and links to the Schema Reference instead.

The viewer shows two tabs, Template and Mixin, matching the glossary. The tree builder merges the schema's three root `anyOf` branches into those two tabs, so `extends` appears as a field and the fields it relaxes are marked "Required unless `extends` is set". Permalinks look like `#template.tasks[].condition` and `#mixin.tasks[].id`. Shared `tasks[]` fields resolve to the Template tab.

## Considered Options

- **An off-the-shelf renderer** (`json-schema-for-humans`, Stoplight Elements, Redoc over a stub OpenAPI document). Rejected. They render the root `anyOf` as three near-identical trees, they can't show runtime-only rules, and they can't be embedded in Studio, the extension and Astro alike.
- **Building the tree from Zod at runtime.** Rejected: it bundles Zod into every viewer host, and it can disagree with the committed JSON Schema the editor uses.
- **A hand-maintained list of rules and guide links in the viewer package.** Kept only for whole-file rules. Facts about a field live on that field, next to the validator that enforces them.
- **Three tabs that mirror the code (Template, Extending Template, Mixin).** Rejected. "Extending Template" isn't a domain term, and two of the tabs would be almost identical.

## Consequences

- The `x-atomize-*` keyword names and the permalink format are contracts. Docs link to the permalinks, and the viewer reads the keywords. Renaming either breaks links.
- `atomize-schema` now carries documentation-only metadata. The existing `.describe()` calls already set that precedent.
- The viewer must still work with a schema that has none of the `x-atomize-*` extensions.
- `check-schema` and the extension's `prebuild` point at the generated file's new location.
