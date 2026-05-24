# ADR-0011: Explicit VS Code validation profile picker

## Status
Accepted

## Context

The VS Code extension had a single `Atomize: Validate` command that always ran Offline Validation. Adding Online Validation (via `atomize validate --profile <name>`) required deciding how to surface it without fragmenting the authoring workflow into too many commands.

Three shapes were considered:

1. **Two separate commands** — `Atomize: Validate` (offline always) + `Atomize: Verify Online` (picker always). Clean intent, but splits validation across two commands.
2. **Smart merged command** — `Atomize: Validate` runs online silently from workspace configuration when set, offline when not. First-run experience stays friction-free, but online validation becomes hidden behavior.
3. **Always-prompt merged command** — `Atomize: Validate` always shows a picker. Maximum flexibility, maximum friction.

## Decision

Use a single explicit `Atomize: Validate` command. Validation Profile Selection is always user-driven — the system never chooses the validation mode silently.

`Atomize: Validate` fetches Azure DevOps profiles from `atomize auth list --json`:
- **One or more ADO profiles exist** → show a picker with those profiles plus an "Offline only" option.
- **No ADO profiles exist** → show a two-item picker: "Run offline" and "Add profile...". "Add profile..." awaits `manageProfiles` inline, then re-fetches profiles and re-enters Validation Profile Selection. This loops until the user picks a mode or dismisses the picker.

The "Add profile..." item does not appear in the normal picker (one or more profiles present).

The CLI default ADO profile remains the source of truth for connection-profile defaults. VS Code may mark or sort that profile first using the CLI's `isDefault` flag, but it must not run Online Validation silently. VS Code does not define a separate validation-default setting and does not offer to save a workspace validation default.

A single CLI invocation (`atomize validate --profile <name>`) produces the combined offline + online result; no separate merge pass is needed.

## Consequences

- Validation Profile Selection is shown on every run regardless of profile state.
- Users with ADO profiles explicitly choose Online Validation or Offline Validation on each run.
- Users with no ADO profiles are shown a path to add one rather than silently falling back to Offline Validation.
- The CLI default ADO profile is visible in VS Code but not automatically selected.
- There is no second VS Code default to become stale when a CLI profile is renamed or removed.
- The panel title suffix `(Online)` / `(Offline)` is required to distinguish runs because the singleton panel persists after closing the file.
