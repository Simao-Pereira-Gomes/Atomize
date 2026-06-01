# Catalog migration command semantics

## Decision

`atomize template migrate` moves items from Legacy Catalog Storage to the current catalog storage root. The command is opt-in and conservative by default.

## Scope default

The default scope is `user`. Migrating project-scoped items requires `--scope project` or `--scope all`. Project catalog items may be tracked in version control and affect teammates; silent project-state mutation on an unqualified invocation would be surprising.

## No schema validation during migration

`migrate` copies legacy files unconditionally without validating their YAML content against the current schema. This differs from `template install`, which validates before writing.

Rationale: the purpose of `migrate` is to preserve all legacy items regardless of schema drift that may have occurred since they were saved. A legacy item that fails current schema validation is still the user's file and should reach the new location intact. Validation is `template validate`'s job, not the migration path's job.

## No `--overwrite` flag

`migrate` never replaces an item that already exists in the new catalog path, even when `--overwrite` is absent from the command. Items found in both the Legacy Catalog Storage and the new catalog path are reported as "already migrated" and skipped unconditionally.

Rationale: any item in the new catalog path was put there by a deliberate CLI write (`install`, `create --save-as`) or a previous migration run. All three write paths call `cleanupLegacyDestinationFiles` on success, so the both-paths case is rare and indicates something the user intentionally placed in the new location. Overwriting it with the legacy version would silently undo that intent.

Users who want the legacy version to win should delete the new-path item first, then run `migrate`.

## Source cleanup after each move

After copying the active legacy file to the new catalog path, `migrate` deletes all same-stem extension variants (`.atomize.yaml`, `.atomize.yml`, `.yaml`, `.yml`) from the legacy kind subdirectory for that item name. This is the same cleanup applied by `install` and `create --save-as` and ensures no ghost items re-surface in the catalog from the legacy directory.

## `--cleanup-dirs` flag

By default, empty legacy directories are left in place after migration. The `--cleanup-dirs` flag enables removal of empty kind subdirectories (`templates/`, `mixins/`) and, if both are empty after migration, the legacy root itself (`~/.atomize/templates/` or `<workspace>/.atomize/templates/`). Directories containing unrelated files are never removed.

`--dry-run --cleanup-dirs` reports which directories would be removed without touching the filesystem.

## Consequences

- All legacy items, including those with stale schemas, can be migrated without manual intervention.
- Items already in the new catalog path are never silently replaced by the migration command.
- Legacy directories persist after migration unless `--cleanup-dirs` is passed.
- `template migrate` versus `template install --overwrite`: use `migrate` to bulk-promote untouched legacy items; use `install --overwrite` to deliberately replace an item with a specific file.
