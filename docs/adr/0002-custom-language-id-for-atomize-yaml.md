# Custom language ID for Atomize YAML files

Atomize YAML files (Templates and Mixins) share a structure that doesn't exist in generic YAML — `version:`, `tasks:`, `filter:`, `estimation:`. Piggybacking on the built-in `yaml` language ID would mean associating the JSON Schema via workspace settings (requiring users to opt in manually) and would give the extension no reliable activation signal scoped to Atomize files.

We register a custom language ID `atomize-yaml` in the extension manifest. This gives VS Code a named hook for schema association, status bar display, and future language features (completions, diagnostics) without requiring any user configuration. The language ID covers both Templates and Mixins — not just Templates — because both benefit from the same schema and extension features.

**Considered options:** Using `yaml` as the language ID and relying on `redhat.vscode-yaml`'s `yamlValidation` contribution was simpler upfront, but would make schema autocomplete contingent on a third-party extension being installed and would limit our ability to scope activation events, syntax highlighting, and future code actions to Atomize files only.

**Consequences:** `atomize-yaml` is a public contract. Renaming it later would break any user workspace settings or `.vscode/settings.json` files that reference it by name. The three-layer detection strategy (filename patterns → firstLine modeline → content heuristics) exists to assign this ID reliably across the range of locations where Atomize files are stored in practice.
