# ADR-0022: Workspace Default Profile pre-selection across all pickers

## Status
Accepted

## Context

ADR-0011 ruled out a workspace-level validation default setting on the grounds that "the system never chooses the validation mode silently." The concern was that silent auto-selection could run Online Validation against the wrong profile and mislead the user.

As the extension grew to include Generate and Live Preview panels — each with their own profile picker — the friction of re-picking the same profile on every invocation became real. Teams working in a single ADO org pick the same profile on every command, every session.

The key distinction missed in ADR-0011 is between **silent selection** (the system chooses without showing the picker) and **pre-selection** (the system focuses a matching item in the picker, user still confirms with a keypress). Pre-selection does not bypass user intent.

## Decision

Introduce an `atomize.defaultProfile` workspace-scoped setting (`"scope": "window"`) that stores a Connection Profile name. When set, the matching item is pre-focused in the Validate, Generate, and Live Preview profile pickers. The user always sees the picker and always confirms.

A shared `profile-picker.ts` module owns all three pickers and `fetchAdoProfiles`. It exposes a single `pickProfile(cliPath, opts)` function parameterised by title, whether "Offline only" is available, and `defaultProfile`. Returns `string | undefined | null` (profile name, offline, or cancelled).

If the configured name does not match any known profile, the picker opens with no pre-selection and no error.

Validation remains explicitly user-driven: the picker is always shown, the user always confirms, and "Offline only" is always available. The only change from ADR-0011 is that the matching profile item may be pre-focused by the workspace setting.

## Consequences

- `atomize.defaultProfile` is workspace-scoped; committing it in `.vscode/settings.json` is safe (stores a name, not a credential).
- Settings Sync does not carry profile names across machines (intentional — profile names are machine-local).
- A stale or mismatched `atomize.defaultProfile` degrades gracefully to no pre-selection.
- `fetchAdoProfiles` is no longer duplicated across three files.
- The Validate picker retains "Offline only"; `atomize.defaultProfile` never pre-focuses that item.
