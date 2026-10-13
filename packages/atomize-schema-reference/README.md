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
