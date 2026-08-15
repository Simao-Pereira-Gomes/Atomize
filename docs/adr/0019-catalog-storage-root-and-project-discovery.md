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

During migration, the CLI reads legacy user and project paths (`~/.atomize/templates/{templates,mixins}`, `<workspace>/.atomize/templates/{templates,mixins}`) but writes only to the new `catalog` paths. Precedence within each scope favors the new path over the legacy one; scope precedence remains project → user → builtin. When a new-path and legacy-path item collide within the same scope, the new-path item wins and the legacy one is shown as overridden — the public `template list --json` contract is unchanged, since which path an item resolved from is exposed only through its `path` value, not a new field.

Writes to a same-named item fail without explicit overwrite when the destination scope already holds that item under either path; overwrite writes the new path and removes the same-stem legacy files, leaving other scopes and unrelated files untouched. `template remove` removes only the resolved active user item (new or legacy path) — it does not sweep hidden legacy duplicates or other scopes.

Built-in catalog assets move to `packages/cli/catalog/{templates,mixins}`; the package no longer ships the old `templates/{templates,mixins}` layout, so built-in discovery hard-switches rather than falling back.

## Consequences

New writes consistently use `catalog`, while old user and project items remain readable during migration. Users can migrate a single item by overwriting it through the CLI; bulk migration can still be done manually by moving files.

This change does not add broader legacy cleanup behavior. Legacy items remain read-compatible until users move, overwrite, or remove those files explicitly.
