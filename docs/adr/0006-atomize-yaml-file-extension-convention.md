# `.atomize.yaml` as the canonical file extension for Atomize files

## Context

The VS Code extension needs to assign the `atomize-yaml` language ID to Atomize files to enable schema autocomplete, CodeLens, snippets, and diagnostics. Three mechanisms exist for this:

1. **File extension** — registered in `contributes.languages.extensions`; VS Code assigns the language ID natively before any extension code runs.
2. **Modeline** — `# atomize-yaml` on line 1; registered via `contributes.languages.firstLine`; also an early return in `detectAtomizeLanguage` for disk-read fallback paths.
3. **Content detection** — structural heuristics scanning the first 50 lines (Template: `version:` + `filter:` + `tasks:` at root; Mixin: `tasks:` + nested `id:`, no `version:`).

The original Layer 1 filename pattern (`/\/atomize\/.*\.ya?ml$/i`) matched every YAML file under any parent directory named `atomize`, including the entire repo checkout path. It was removed.

## Decision

`.atomize.yaml` (and `.atomize.yml`) is the canonical file extension for Atomize files. It is registered in `contributes.languages.extensions` so VS Code assigns `atomize-yaml` natively — no content read, no extension activation timing dependency.

**Detection layer ordering after this decision:**

1. Language ID already set → accepted immediately.
2. `.atomize.yaml` / `.atomize.yml` extension → VS Code native, zero extension code.
3. `# atomize-yaml` modeline on line 1 → VS Code native (`firstLine`) + code fallback; retained for files that cannot follow the naming convention.
4. Content heuristics → fallback for unmarked `.yaml`/`.yml` files.

**Catalog storage:** `saveUserTemplate`, `getUserTemplatePath`, and `getProjectTemplatePath` write new templates as `<name>.atomize.yaml`. `installFromFile` and `installFromContent` normalise the stored copy to `.atomize.yaml` regardless of the source extension. Discovery (`listDirectoryItems`) accepts both `.atomize.yaml` and plain `.yaml` for backward compatibility; when both exist for the same logical name in the same directory, `.atomize.yaml` takes precedence.

**Built-in templates** under `templates/` are stored as `.atomize.yaml`. The modeline is not included — the extension handles detection, and content heuristics catch the structural signature as a further fallback.

## Alternatives considered

**Modeline as primary signal.** `# atomize-yaml` on line 1 works without renaming files, and VS Code's `firstLine` feature handles it natively. Rejected as the long-term primary because it requires the extension to be active to propagate the language ID in some code paths (the disk-read fallback), and it requires content to be read before VS Code can activate the language — slower and less reliable than an extension match.

**Directory-based pattern** (`/\/atomize\/.*\.ya?ml$/i`). Collapsed to a false positive the moment the repo is checked out under a parent directory named `atomize`. Removed entirely.

**Content detection as primary.** Fragile by design — generic YAML formats (Taskfile, Ansible, CI pipelines) share structural features with Atomize files. Kept as a fallback only.

## Consequences

- Existing user and project templates stored as plain `.yaml` continue to be discovered by the catalog (backward-compatible filter). No migration required.
- The modeline (`# atomize-yaml`) is retained as Layer 3 and documented as the recommended opt-in for files that cannot follow the `.atomize.yaml` naming convention (e.g., templates constrained by a third-party tool's naming rules).
- The `atm-template`, `atm-mixin`, and `atm-extends` snippets insert `# atomize-yaml` on line 1 when used in an `atomize-yaml` editor, preserving the modeline fallback if the file remains plain `.yaml`.
- Renaming `.atomize.yaml` or removing it from `contributes.languages.extensions` is a public contract break — workspace settings and `.vscode/settings.json` files that rely on the language ID being assigned by extension would stop working.
