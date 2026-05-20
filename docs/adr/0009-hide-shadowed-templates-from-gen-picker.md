# Hide shadowed templates from the gen picker

## Context

The `atomize gen` catalog picker used to show both the active winner and any shadowed/overridden templates for each name. A project template that overrides a built-in would produce two entries with the same display name, differing only by a `— overridden by project` suffix. This was hard to parse, especially with more than a handful of templates.

## Decision

The gen picker shows only the active (winning) catalog entry per template name. Shadowed templates are hidden from the picker.

The `atomize template list` command remains the authoritative surface for inspecting the full override hierarchy, including which scope overrides which and at what path.

## Consequences

- Users cannot pick a shadowed template directly from `atomize gen`. If they need to run a specific overridden file they must pass the file path directly (`atomize gen ./path/to/template.yaml`).
- The picker is simpler and unambiguous: one entry per logical name.
- Override inspection is a deliberate action via `atomize template list`, not an incidental part of task generation.
