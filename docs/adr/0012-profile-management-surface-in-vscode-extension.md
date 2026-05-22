# VS Code extension profile management surface

## Context

The VS Code extension fetches Azure DevOps Connection Profiles via `auth list --json` to populate the Validation Profile Selection picker, but exposes no commands for creating or managing profiles. Users who have no profiles configured cannot proceed past the validation picker without switching to a terminal.

Three triggers were identified: onboarding friction (empty profile picker), day-to-day profile management (add/remove/set default), and token rotation. All three are addressed by a dedicated profile management surface.

## Decision

The extension adds an `Atomize: Manage Profiles` command (command palette) implementing a profile-first QuickPick flow:

- Top level: list of existing Azure DevOps Connection Profiles + "Add profile..." at the bottom
- Selecting an existing profile: action QuickPick with Set as default, Test, Rotate, Remove
- After any action: return to the profile list and refresh; Remove closes the action QuickPick and returns to the refreshed profile list
- Test uses `vscode.window.withProgress` and surfaces the result as a VS Code notification before returning to the profile list

**Add** collects inputs via a sequential InputBox chain (name → org URL → project → team → PAT masked), then calls the CLI non-interactively using `--org-url`, `--project`, `--team`, and `--pat-stdin` flags. No interactive prompts are delegated to a terminal.

**Rotate** uses the same pattern: one masked InputBox for the new PAT, then calls `atomize auth rotate <name> --pat-stdin`. This requires adding `--pat-stdin` to the CLI's `auth rotate` command as a prerequisite.

**Scope is Azure DevOps only.** GitHub Models profiles are excluded because the extension has no surface that exercises them (`template create --ai` is CLI-only). GitHub Models profile management remains CLI-only.

**The extension does not support `--insecure-storage`.** When the OS keychain is unavailable, the native UI flow fails and users must use the CLI directly.

## Alternatives considered

**Terminal delegation for all actions** (open a terminal and run `atomize auth add` interactively): keeps PAT handling entirely out of extension code and preserves the CLI's keychain/file fallback logic. Rejected because the terminal flow cannot signal completion to the extension for profile list refresh, and the UX is inconsistent with the rest of the extension's interaction model.

**Exposing management actions inside the Validation Profile Selection picker**: contextual and zero extra commands. Rejected because it couples a management concern into a flow whose job is to select a profile for a single validation run; a dedicated command is a cleaner boundary.

**Including GitHub Models profiles**: would require a second form branch and a new AI surface that does not exist yet. Deferred until `template create` has an extension surface.

**Exposing `--insecure-storage`**: would require the extension to warn about security trade-offs and handle a second storage path. The keychain-only constraint keeps the extension out of credential storage policy decisions.

## Consequences

- The CLI must add `--pat-stdin` to `auth rotate` before the extension's Rotate action can be implemented natively.
- Users in headless or Docker environments cannot use the Profile Management Surface; they must use the CLI.
- GitHub Models users must use the CLI for all profile management until a `template create` extension surface exists.
- The Profile Management Surface is a new extension responsibility separate from the authoring surface defined in ADR-0007.
