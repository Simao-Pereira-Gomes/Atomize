# Schema Reference

Shared, source-only Schema Tree Builder and Solid viewer for Atomize YAML Files.
The generated JSON Schema in this package is the input for both the reference and
the VS Code extension's YAML schema association. Internal imports stay relative
so each host can compile the component with its own Solid toolchain.

Regenerate the artifact from the workspace root with `bun run --cwd packages/cli generate-schema`.
Run the unit tests and viewer smoke test with `bun run --cwd packages/atomize-schema-reference test`.

Import `buildSchemaTrees` from the package root, `SchemaReference` from `/viewer`,
the generated artifact from `/schema.json`, and the optional scoped stylesheet
from `/styles.css`. Pass the built trees and a host-supplied `versionLabel` to the
viewer. The builder preserves union alternatives rather than presenting fields
from mutually exclusive objects as required together.

The viewer includes expandable field navigation and recursive name/description
search. `searchSchemaTree`, also exported from the package root, keeps matches and
their ancestors. Clearing the search restores the previous expansion state.

Hosts can set `data-theme="light"` or `data-theme="dark"` on the document root or
viewer element; otherwise the stylesheet follows the system preference. The
optional `notice` prop is for host-specific context such as development versions.

Every field offers a copy-link action. Links use URL fragments such as
`#template.tasks[].condition` and `#mixin.tasks[].id`; opening a link switches tabs,
clears any search that could hide the target, expands its ancestors, and highlights
the field. Fragment changes and browser Back/Forward navigate the same way.
If clipboard access is unavailable, the action provides a selectable URL instead.

The package root exports `buildPermalink(tab, path)`, `parsePermalink(fragment)`,
and `normalizeDocumentPath(trees, documentPath, tab?)` for host integrations.
Normalization converts concrete indices to `[]`, resolves dictionary entries to
`*`, and falls back to the nearest existing ancestor. It defaults to Template for
shared task fields; an explicit Mixin tab is preserved. Union alternatives share
their owning field's permalink; shared child paths land on the first definition.

Runtime-only field rules live in the owning Zod field's `x-atomize-rules` metadata.
The generator preserves them and the viewer displays them under “Runtime rules”.
These cover condition operators, dates, saved queries, task IDs and dependencies,
repeat restrictions, custom-field keys, conversion constraints, fallback estimates,
required Tasks, and relevant validation warnings.

Rules spanning several fields live in `wholeFileRules`, keyed by tab and exact
schema path. `buildSchemaTrees(schema, fileRules?)` attaches them at that field;
the default list documents percentage bounds and generated Task counts on
`template.tasks`. Passing an empty list disables these additions. Contract tests
require every listed path to exist in the generated schema, with no ancestor fallback.

Fields link to their behaviour sections through `x-atomize-guide` metadata on the
Zod schema. Values are Template Reference heading anchors, never URLs. Hosts pass
`guideUrl(anchor)` to resolve them and can supply `openExternalLink(url)` to open
links through their system browser API. Without an opener the viewer uses ordinary
browser links; without a resolver or a field anchor it omits the link. The website
resolves anchors to the GitHub-rendered Template Reference on `main`. Its Solid
wrapper supplies the resolver inside the Astro island so it survives hydration.
Contract tests check every generated guide anchor against the guide's headings.
