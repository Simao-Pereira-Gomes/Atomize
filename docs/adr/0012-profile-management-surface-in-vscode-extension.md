# VS Code extension profile management surface

## Context

The VS Code extension fetches Azure DevOps Connection Profiles via `auth list --json` to populate the Validation Profile Selection picker, but exposes no commands for creating or managing profiles. Users who have no profiles configured cannot proceed past the validation picker without switching to a terminal.

Three triggers were identified: onboarding friction (empty profile picker), day-to-day profile management (add/remove/set default), and token rotation. All three are addressed by a dedicated profile management surface.

## Decision

The extension adds command id `atomize.manageProfiles` with title `Atomize: Manage Profiles` as a command-palette-only command. The command is contributed unconditionally and registered during normal extension activation. This iteration does not add editor title, context menu, or Validation Profile Selection entry points.

The existing Validation Profile Selection flow is not changed to include profile-management actions. If validation finds no Azure DevOps profiles, it continues to run Offline Validation as today unless a separate validation UX decision changes that behavior later.

### Profile list flow

- Top level: list of existing Azure DevOps Connection Profiles + "Add profile..." at the bottom
- Existing profiles are sorted with the Azure DevOps default first, then alphabetically by profile name. "Add profile..." always appears at the bottom after a separator.
- Profile rows use the profile name as the label, default/storage status as description, and organization URL, project, and team as detail. The action picker title includes the profile name and shows the same connection details where practical.
- Empty top level: show only "Add profile..." with a placeholder indicating that no Azure DevOps profiles are configured
- Selecting an existing profile: action QuickPick with Set as default, Test, Rotate, Remove. Set as default is hidden for the current Azure DevOps default profile because it would be a no-op.
- The action picker includes a Back item. Selecting Back returns to the refreshed top-level profile list; pressing Escape closes the Manage Profiles command.
- After any action: return to the profile list and refresh; Remove closes the action QuickPick and returns to the refreshed profile list
- Test uses `vscode.window.withProgress` and surfaces the result as a VS Code notification before returning to the profile list. Add, Rotate, and Remove also use progress notifications while the CLI operation runs. Set as default may run without progress because it is metadata-only and expected to be fast. Notifications use extension-owned wording: success reports that the operation succeeded; failure includes a concise sanitized CLI error summary when available and otherwise reports a generic failure.
- Profile management actions are serialized inside the command. The active picker is closed while an operation runs; after completion or recoverable failure, the extension fetches profiles again and shows a fresh top-level picker.

### CLI contract

The command probes the configured CLI before showing profile UI. If the CLI is unavailable, it reuses the existing CLI unavailable flow and stops. If `auth list --json` fails after a successful probe, the extension shows an error notification and stops rather than displaying an empty profile list.

Manage Profiles requires a CLI version that supports the profile-management contracts in this ADR: `auth rotate --pat-stdin`, `auth remove --confirm`, and `auth list --json` with `tokenStorage`. The command gates on that minimum version or equivalent capability check when invoked without raising the minimum CLI requirement for unrelated validation and preview flows.

The extension treats `auth list --json` as the only profile discovery API and does not read Atomize connection files or credential storage directly. For Azure DevOps profiles, the JSON contract must include `name`, `platform`, `isDefault`, `organizationUrl`, `project`, `team`, and `tokenStorage`, where `tokenStorage` is a structured enum value such as `"keychain"` or `"file"` rather than terminal display text.

For Add, Set as default, Rotate, Remove, and Test, the extension owns success and failure notification wording. CLI stdout/stderr is captured for concise sanitized failure detail only. Cancellation and Back navigation do not show notifications.

### Add

**Add** collects required inputs via a sequential InputBox chain (name → org URL → project → team → PAT masked), then calls the CLI non-interactively using `--org-url`, `--project`, `--team`, and `--pat-stdin` flags. No interactive prompts are delegated to a terminal, and the extension does not fetch Azure DevOps projects or teams during Add. The extension does not expose a default-profile checkbox and does not pass `--default`. If no Azure DevOps default exists, the CLI may make the new Azure DevOps profile the default; if a default already exists, Add preserves it unless the user separately chooses Set as default.

PATs are passed to the CLI by spawning the configured CLI path with `shell: false`, writing the PAT to `stdin`, and ending stdin. The extension never constructs a shell command containing a PAT and never logs stdin content.

Cancelling any Add input cancels the Add operation, does not call the CLI, does not show an error, does not retain the PAT or partial input, and returns to the refreshed top-level profile list.

The extension performs only minimal Add input checks: name, org URL, project, team, and PAT must be non-blank. The CLI remains the source of truth for profile-name and organization URL validation; CLI validation errors are surfaced as VS Code error notifications.

All Add InputBoxes use `ignoreFocusOut: true` so users can copy details from Azure DevOps or other references. PAT InputBoxes for Add and Rotate use masked input, keep focus when the user switches windows, and validate only on submit. Blank or whitespace-only PAT input keeps the InputBox open with an inline validation message; cancellation discards the PAT.

Profile names are displayed exactly as returned by `auth list --json` and passed unchanged to CLI commands. For new profile input, the extension trims leading and trailing whitespace before the non-blank check, then lets the CLI enforce canonical validation and duplicate detection.

### Set as default

Set as default is available for any non-default Azure DevOps profile returned by `auth list --json`, including file-backed profiles, because it changes only profile metadata.

Set as default calls `atomize auth use <name>` immediately without an extra warning modal. It changes the global CLI Azure DevOps default profile and does not write workspace-specific settings.

### Rotate

**Rotate** uses the same pattern: one masked InputBox for the new PAT, then calls `atomize auth rotate <name> --pat-stdin`. This requires adding `--pat-stdin` to the CLI's `auth rotate` command as a prerequisite.

Cancelling the Rotate PAT input does not call the CLI, does not show a notification, discards the PAT, and returns to the refreshed top-level profile list.

Add and Rotate do not automatically test Azure DevOps connectivity after saving. They report storage success or failure only; users can run the explicit Test action from the refreshed profile list.

Rotate is only supported for keychain-backed Azure DevOps profiles. `auth list --json` must expose the token storage method so the extension can block file-backed profiles before asking for a new PAT. File-backed Azure DevOps profiles still appear in the top-level list, but only Set as default, Test, and Remove are available for them. Rotate remains visible in the action picker as unavailable and shows a clear message directing users to the CLI. Missing or unknown token storage values are treated as unsupported for Rotate but still allow Set as default, Test, and Remove. Extension-created profiles never pass `--insecure-storage`, so they either use the OS keychain or fail.

### Remove

**Remove** performs confirmation in the extension, then calls `atomize auth remove <name> --confirm`. The confirmation is a VS Code warning modal naming the profile and stating that the saved token is deleted and cannot be recovered by Atomize; it does not require typed confirmation. The CLI remove command requires an explicit profile name when `--confirm` is used and never prompts in that mode. It may also support `--new-default <name>` for callers that want deterministic default reassignment after removing the current default profile, even though the first extension implementation does not plan to use it. `--new-default` must be used with `--confirm`, must name an existing profile, and must target the same platform as the removed profile. If the removed profile was default and no `--new-default` is provided, the platform default is left unset.

Remove delegates metadata and token deletion entirely to the CLI and is available for both keychain-backed and file-backed Azure DevOps profiles.

Removing the last Azure DevOps profile is allowed. If it was the default, the Azure DevOps default becomes unset, and the refreshed top-level list shows the Azure DevOps empty state.

Editing non-secret profile fields is out of scope. Users remove and re-add a profile to change organization URL, project, or team.

### Scope and storage

**Scope is Azure DevOps only.** GitHub Models profiles are excluded because the extension has no surface that exercises them (`template create --ai` is CLI-only). GitHub Models profile management remains CLI-only. If `auth list --json` returns only GitHub Models profiles, the Profile Management Surface still shows the Azure DevOps empty state and does not show disabled GitHub Models rows.

**The extension does not support `--insecure-storage` for operations that create or replace a PAT.** Add and Rotate are keychain-only; when the OS keychain is unavailable, those native UI flows fail and users must use the CLI directly. Test, Set as default, and Remove remain available for any Azure DevOps profile returned by `auth list --json` because they do not collect a new PAT in the extension.

## Alternatives considered

**Terminal delegation for all actions** (open a terminal and run `atomize auth add` interactively): keeps PAT handling entirely out of extension code and preserves the CLI's keychain/file fallback logic. Rejected because the terminal flow cannot signal completion to the extension for profile list refresh, and the UX is inconsistent with the rest of the extension's interaction model.

**Exposing management actions inside the Validation Profile Selection picker**: contextual and zero extra commands. Rejected because it couples a management concern into a flow whose job is to select a profile for a single validation run; a dedicated command is a cleaner boundary.

**Including GitHub Models profiles**: would require a second form branch and a new AI surface that does not exist yet. Deferred until `template create` has an extension surface.

**Exposing `--insecure-storage`**: would require the extension to warn about security trade-offs and handle a second storage path. The keychain-only constraint keeps the extension out of credential storage policy decisions.

## Consequences

- The CLI must add `--pat-stdin` to `auth rotate` before the extension's Rotate action can be implemented natively.
- The CLI must expose token storage method in `auth list --json` so the extension can enforce keychain-only rotation.
- The CLI must expose a non-interactive remove contract before the extension's Remove action can be implemented natively.
- Users in headless or Docker environments cannot use the Profile Management Surface; they must use the CLI.
- GitHub Models users must use the CLI for all profile management until a `template create` extension surface exists.
- The Profile Management Surface is a new extension responsibility separate from the authoring surface defined in ADR-0007.
