# Catalog storage root and project discovery

## Decision

Catalog items are stored under `catalog` rather than a nested `templates/templates` root:

- built-in items: `packages/cli/catalog/{templates,mixins}`
- user items: `~/.atomize/catalog/{templates,mixins}`
- project items: `<workspace>/.atomize/catalog/{templates,mixins}`

Public catalog scope remains `project`, `user`, or `builtin`. Implementation may use an internal source tier to distinguish same-scope new and legacy roots for precedence.

## Workspace Discovery

Project scope resolves from a discovered workspace root instead of raw `process.cwd()`, so running Atomize from a subdirectory does not accidentally create a separate project catalog.

Discovery starts at `process.cwd()` and walks upward in this order:

1. nearest ancestor containing a `.atomize/` directory
2. nearest git root
3. current working directory

An empty `.atomize/` directory is an explicit workspace marker; a `.atomize` file is not. A git root is the nearest ancestor where `.git` exists as either a directory or a file. Project state is written beside `.git` under `<workspace>/.atomize/`, never inside `.git`.

Workspace discovery is based on the invocation directory, not on install source file paths. When no `.atomize/` marker or git root exists, project writes fall back to the invocation directory.

## Migration Compatibility

During migration, the CLI reads legacy user and project paths but writes only to the new `catalog` paths:

- legacy user paths: `~/.atomize/templates/{templates,mixins}`
- legacy project paths: `<workspace>/.atomize/templates/{templates,mixins}`

Precedence is:

1. project catalog
2. project legacy templates
3. user catalog
4. user legacy templates
5. builtin

Legacy project reads are anchored to the discovered workspace root. Atomize does not scan accidental invocation-subdirectory legacy catalogs.

When a new-path item and legacy-path item collide within the same scope, the new-path item is active and the legacy-path item is shown as overridden with its actual source path. `template list` and `template list --json` keep the public JSON contract unchanged; actual `path` values identify whether an item came from new or legacy storage. The internal source tier is not part of `template list --json`; consumers use public `scope` and `path`.

Every scanned catalog or legacy directory preserves ADR-0006 filename compatibility: `.atomize.yaml` and `.atomize.yml` variants are preferred over plain `.yaml` and `.yml` variants for the same logical name.

## Write Behavior

Installing or saving a same-named item fails without explicit overwrite only when the destination scope already has that item in either the new path or the legacy path. Built-in items and other scopes do not block installs.

With overwrite, Atomize writes the new-path item and deletes same-stem legacy item files in the destination scope (`.atomize.yaml`, `.atomize.yml`, `.yaml`, and `.yml` variants), leaving unrelated legacy files, other scopes, and directories in place.

Commands that write named catalog items, including `template install` and `template create --save-as`, use the same destination-scope conflict behavior.

## Remove Behavior

`template remove` removes the resolved active user item whether it lives in the new user catalog or the legacy user path. It does not remove hidden legacy duplicates, project items, built-ins, unrelated files, or empty directories.

Project removal remains out of scope for this decision.

## Built-In Catalog Assets

Built-in catalog assets move to `packages/cli/catalog/{templates,mixins}`. The package includes only the new `catalog` asset paths; it does not ship the old `templates/{templates,mixins}` package layout. Built-in discovery hard-switches to `<packageRoot>/catalog`.

Built-in items continue to use public scope `builtin`.

## Consequences

New writes consistently use `catalog`, while old user and project items remain readable during migration. Users can migrate a single item by overwriting it through the CLI; bulk migration can still be done manually by moving files.

This change does not add broader legacy cleanup behavior. Legacy items remain read-compatible until users move, overwrite, or remove those files explicitly.
