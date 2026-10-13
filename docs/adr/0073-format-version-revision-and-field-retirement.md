# `formatVersion` is the file format, `version` is the author's revision, and fields retire only through a new format

`version` used to be documented as "Schema version. Always '1.0'", but nothing read it except as a hint for telling Mixins from Templates. Authors could reasonably take it for the template's own revision, and `metadata.changelog[].version` encouraged that reading. Meanwhile the Jira and Linear PRD (#52) needs to recognise legacy Templates and migrate them. That's impossible while the only version-like field is one that authors bump freely.

The decision:

- **`formatVersion`** names the edition of the Atomize schema a Template or Mixin follows. It's optional, and a missing value means `"1.0"`, so every existing file is already format 1.0 without any change. Any value this release can't read is an error. The CLI, Studio and AI drafts write it explicitly.
- **`version`** is the author's own revision: free text, optional, never interpreted by Atomize. A child Template doesn't inherit its parent's revision, because it's a different file. Existing `version: "1.0"` values simply become revision "1.0".
- **Neither field tells a Mixin from a Template.** That's structural: a standalone file whose root keys all belong to the Mixin schema is a Mixin; any Template-only key makes it a Template. A file referenced from `mixins:` or `extends:` is read as that kind regardless.

## Retiring fields

The schemas reject unknown keys, so deleting a field from the schema would make every file that still has it fail validation. That's a hard break for files in users' repos and catalogs, and the only usage we can measure is in this repository. So fields retire in two steps:

1. **Deprecate.** The field stays readable, is marked `deprecated` in the schema, produces a non-blocking warning even in strict mode, and is no longer written by the CLI, Studio or AI drafts. A VS Code quick fix removes it, except where removal would discard text the author may want to keep.
2. **Remove in a new format.** Removal ships as format `"2.0"`, together with a migration that reads 1.0 files by dropping the retired fields with a warning. Files without `formatVersion` keep working, and only files that declare 2.0 are strict about the removed fields.

Deprecated now, for removal in format 2.0:
- `tasks[].acceptanceCriteria`: never written to the Task, and the same as writing in `description`.
- `tasks[].acceptanceCriteriaAsChecklist`
- `tasks[].estimationFormula`: never evaluated, and gave the Task a Task Estimate of 0.
- `created`, `lastModified`
- `metadata.difficulty`, `metadata.recommendedFor`, `metadata.examples`, `metadata.changelog`
- `estimation.minimumTaskPoints`

## Metadata and tags

Kept, because Catalog discovery and authoring will use them:
- Top-level `tags` and `metadata.category`. The Catalog should filter by tag and group by category in the CLI, Studio and VS Code; today it reads neither.
- `author`, `metadata.estimationGuidelines` and `metadata.notes`. They are already AI context when improving a Template, and `notes` is the only maintainer note that survives Studio rewriting the YAML (which drops comments).
- `estimation.strategy` stays as a reserved switch for a future non-percentage strategy.

Because `version` is now an author revision, the Catalog can later show it next to a clone's `origin` ("your clone is at 3, the Catalog has 5"). Until revisions are given a comparable format, they're displayed only, never compared.

## Considered Options

- **Keep `version` as the format and add a `revision` field.** Rejected. Every reader would keep taking `version` for a revision, and the error message would have to explain the trap forever.
- **Make `version` the format and validate it strictly.** Rejected for the same reason, and because it would turn existing revision-like values into errors.
- **Delete deprecated fields from the 1.0 schema in a major release.** Rejected: it breaks files we can't see, with nothing to migrate them.
- **Fold `acceptanceCriteria` into `description` automatically.** Rejected. Merging two author-written fields means choosing a format for someone else's text. The warning asks the author to move them instead.
- **Implement `acceptanceCriteria` as a list appended to the description.** Rejected: it's the same outcome as writing in `description`, with one more field to learn.

## Consequences

- `formatVersion` is a contract. Introducing format 2.0 requires shipping the 1.0→2.0 migration in the same release.
- Content detection in VS Code accepts `formatVersion:` as an Atomize marker. A Mixin that sets `version` but not `formatVersion` isn't recognised by content alone, because other tools' files (such as Taskfile.yml) carry a `version` too. The `.atomize.yaml` extension or the modeline still works.
- Code that builds `TaskTemplate` objects no longer gets a defaulted `version`.
