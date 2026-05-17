# YAML schema wiring via redhat.vscode-yaml contributor API

Atomize YAML files need autocomplete, hover documentation, and inline validation from the generated JSON Schema (`schemas/atomize-template.schema.json`). The question is how to associate that schema with open documents.

**Rejected option — `contributes.yamlValidation` in `package.json`:** Maps a schema URL to file glob patterns. Zero runtime code, but matches by file path only, not by language ID. A `templates/` directory full of non-Atomize YAML (common directory name) would incorrectly receive the Atomize schema, violating the requirement that generic YAML files are unaffected.

**Chosen approach — `redhat.vscode-yaml` programmatic `registerContributor` API:** Called at activation time; the callback receives the document URI and returns a schema URI only for documents with `languageId === 'atomize-yaml'`. This precisely honours the language-ID contract established in ADR 0002.

**Scoping strategy — dual-signal in `requestSchema`:**
The callback is called by `yaml-language-server` before our language detection has run on first open. To cover this timing gap without leaking onto arbitrary YAML files, `requestSchema` applies two checks in order:
1. If the document's language ID is already `atomize-yaml` → return schema URI (fast path).
2. If the language ID is `yaml` but the URI matches the Layer 1 filename patterns (same globs as `package.json`'s `filenamePatterns`) → return schema URI (first-open coverage).
3. Otherwise → return `undefined`.

**`anyOf` at root instead of `oneOf`:** The schema generator originally converted `anyOf` → `oneOf` because a file is exactly one of Template or Mixin. At validation time this is correct, but `yaml-language-server` with `oneOf` marks a partially-authored document invalid immediately (before `version:` or task `id:` are present), suppressing completions. The root combinator is kept as `anyOf` so the schema guides authoring rather than blocking it. Runtime validation enforces the mutual-exclusion constraint.

**Graceful degradation:** If `redhat.vscode-yaml` is not installed, `registerContributor` is silently skipped. Language detection continues to work; the user just gets no autocomplete. `redhat.vscode-yaml` is listed as a recommended extension in `package.json`, which is the appropriate channel for the install nudge.

**Consequences:** The `registerContributor` call is runtime behaviour, not a static manifest contribution. If `redhat.vscode-yaml` changes or removes this API, the schema wiring breaks silently. Descriptions for hover tooltips must come from `"description"` annotations in the JSON Schema, which are sourced from `.describe()` calls on Zod field definitions — not from the generated JSON file directly, which would be wiped on regeneration.
