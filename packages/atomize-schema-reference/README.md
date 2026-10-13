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
