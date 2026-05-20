# YAML language service for Atomize YAML files

Atomize YAML files (Templates and Mixins) share a structure that doesn't exist in generic YAML — `version:`, `tasks:`, `filter:`, `estimation:`. Atomize needs a reliable opt-in signal for schema association, CodeLens, diagnostics, and future code actions without leaking behavior into generic YAML files.

Atomize files remain on VS Code's built-in `yaml` language ID so Red Hat YAML provides schema hover descriptions and completions. The extension scopes Atomize behavior with its own document predicates: durable opt-in markers (`.atomize.yaml`, `.atomize.yml`, or first-line `# atomize-yaml`) enable full Atomize editor tooling, while content detection enables schema-backed authoring support and durable opt-in prompting only.

The legacy `atomize-yaml` language ID may still appear if a user selected it manually or an older extension session assigned it. When possible, the extension normalizes those documents back to `yaml` so schema hover descriptions and completions keep working.

**Considered options:** A custom `atomize-yaml` language ID gives VS Code a named hook for snippets, icons, status bar display, and language-scoped features, but Red Hat YAML does not reliably provide schema hovers and completions to that custom language. Static `yamlValidation` wiring was also rejected because it is path-only and can diverge from Atomize's durable/session opt-in rules.

**Consequences:** Atomize-specific snippets cannot rely on automatic `atomize-yaml` assignment as their primary activation mechanism. The extension must keep YAML schema association, CodeLens, and validation scoping in code rather than delegating that boundary to VS Code's language ID alone.
