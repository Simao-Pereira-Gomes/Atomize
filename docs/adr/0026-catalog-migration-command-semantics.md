# Catalog migration command semantics

## Decision

`atomize template migrate` moves items from Legacy Catalog Storage to the current catalog storage root. The command is opt-in and conservative by default.

## Scope, validation, and overwrite are all conservative by default

The default scope is `user` — migrating project-scoped items (version-controlled, affects teammates) requires an explicit `--scope project`/`--scope all`, so an unqualified invocation can't silently mutate project state.

`migrate` copies legacy files without validating them against the current schema, unlike `template install`. The purpose of `migrate` is to preserve every legacy item regardless of schema drift since it was saved — a file failing current validation is still the user's file and should still land at the new location; validation is `template validate`'s job, not migration's.

`migrate` never replaces an item already present at the new catalog path, with no `--overwrite` escape hatch — such items are reported "already migrated" and skipped unconditionally. Anything at the new path got there through a deliberate write (`install`, `create --save-as`, or a prior migration), so overwriting it with the legacy version would silently undo that intent; a user who wants the legacy version to win must delete the new-path item first, then re-run `migrate`.

Source cleanup (deleting the migrated item's legacy-path variants) and the opt-in `--cleanup-dirs` flag for removing emptied legacy directories mirror the same cleanup `install` and `create --save-as` already perform, so no migration path leaves ghost items behind.

## Consequences

- All legacy items, including those with stale schemas, can be migrated without manual intervention.
- Items already in the new catalog path are never silently replaced by the migration command.
- Legacy directories persist after migration unless `--cleanup-dirs` is passed.
- `template migrate` versus `template install --overwrite`: use `migrate` to bulk-promote untouched legacy items; use `install --overwrite` to deliberately replace an item with a specific file.
