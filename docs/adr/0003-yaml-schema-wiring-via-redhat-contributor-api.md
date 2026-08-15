# YAML schema wiring via redhat.vscode-yaml contributor API

Atomize YAML files need autocomplete, hover documentation, and inline validation from the generated JSON Schema (`schemas/atomize-template.schema.json`). The question is how to associate that schema with open documents.

**Rejected option — `contributes.yamlValidation` in `package.json`:** Maps a schema URL to file glob patterns. Zero runtime code, but matches by file path only, not by language ID. A `templates/` directory full of non-Atomize YAML (common directory name) would incorrectly receive the Atomize schema, violating the requirement that generic YAML files are unaffected.

**Chosen approach — `redhat.vscode-yaml` programmatic `registerContributor` API:** Called at activation time; the callback receives the document URI and returns a schema URI only for Atomize YAML files identified by durable markers, the `atomize-yaml` language ID, or session content detection. This honours the language-ID contract established in ADR 0002 while still supporting low-risk schema authoring for likely Atomize YAML files.

The programmatic contributor is the single schema-association path. The extension does not also declare `contributes.yamlValidation`, because static path-based wiring can diverge from the durable/session opt-in rules and make `.atomize.yaml` behave differently from modeline or content-detected Atomize YAML files.

**Scoping strategy:** `yaml-language-server` calls the callback before our language detection has run on first open, so `requestSchema` checks language ID, durable markers, and content heuristics (in that order of confidence) to decide whether to return the schema URI — covering that timing gap without leaking onto arbitrary YAML files.

**`anyOf` at root instead of `oneOf`:** The schema generator originally converted `anyOf` → `oneOf` because a file is exactly one of Template or Mixin. At validation time this is correct, but `yaml-language-server` with `oneOf` marks a partially-authored document invalid immediately (before `version:` or task `id:` are present), suppressing completions. The root combinator is kept as `anyOf` so the schema guides authoring rather than blocking it; runtime validation enforces the mutual-exclusion constraint.

**Consequences:** The `registerContributor` call is runtime behaviour, not a static manifest contribution — if `redhat.vscode-yaml` is missing or changes this API, schema wiring degrades or breaks silently rather than erroring.
