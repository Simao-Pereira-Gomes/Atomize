# VS Code extension context

The VS Code extension provides editor-native authoring, discovery, validation, and generation surfaces for Atomize YAML Files. It consumes the shared Atomize domain in [../../CONTEXT.md](../../CONTEXT.md).

## Glossary

**Atomize YAML Language ID**:
The legacy VS Code language ID `atomize-yaml`; Atomize YAML Files normally remain on VS Code's `yaml` language ID so the YAML language server provides schema hovers and completions.

**Durable Atomize YAML Opt-In**:
A persistent file-level signal that a YAML file is authored for Atomize, currently a `.atomize.yaml`/`.atomize.yml` filename or a first-line `# atomize-yaml` modeline.

**Session Atomize YAML Opt-In**:
An editor-session classification where the VS Code extension gives a content-detected YAML document schema-backed authoring support without changing its language ID.

**Profile Management Surface**:
The VS Code extension command (`Atomize: Manage Profiles`) for creating, removing, testing, rotating, and setting the default Connection Profile.
_Avoid_: conflating this with the **Configuration Entry Point**, which opens extension settings rather than managing credentials.

**Validation Profile Selection**:
The explicit user choice that precedes every VS Code validation run: a named Azure DevOps Connection Profile, Offline Validation, or — when no profiles are configured — a path to add one via the Profile Management Surface. The Workspace Default Profile may pre-focus a Connection Profile in the picker, but the user always confirms before the run begins.
_Avoid_: "Default Validation Profile" for VS Code validation; the picker is always shown and requires explicit confirmation.

**Validation Diagnostics**:
Line-level editor feedback for an Atomize YAML File, surfaced through VS Code diagnostics such as squiggles and the Problems panel.

**Validation Report**:
A file-level summary of an Atomize YAML File validation run, including grouped errors, warnings, and suggestions. The panel title indicates whether the run was Online or Offline.

**CLI Validation Provider**:
The command-line executable the VS Code extension invokes to produce Validation Diagnostics and Validation Reports.

**CLI Installation Command**:
The user-approved command the VS Code extension runs in a visible terminal to install or update the default CLI Validation Provider.

**CLI Update Check**:
An extension-owned registry lookup that detects whether the default CLI Validation Provider has a newer stable release available.

**CLI Feature Requirement**:
A minimum CLI version the extension requires to enable a command. Commands whose requirement is unmet are blocked until the CLI is updated.
_Avoid_: conflating with **CLI Update Check**, which detects that a newer version exists rather than enforcing a minimum.

**Configuration Entry Point**:
A VS Code surface that opens extension settings.
_Avoid_: onboarding, walkthrough, docs link when referring to settings discovery.

**Field Hover Description**:
Schema-backed explanatory text shown by the editor for an Atomize YAML field while authoring.

**Generate Panel**:
VS Code webview panel that drives Task generation from a Template against a live Platform Adapter.

**Mock Preview Panel**:
VS Code webview panel that drives Mock Preview — shows a dynamic form derived from `--inspect`, collects a Mock Story, and renders the resolved Task list on submit.

**Live Preview Panel**:
VS Code webview panel that drives Live Preview — prompts for a Story ID and Connection Profile, then renders the resolved Task list with Story context.

**Catalog Browser**:
A VS Code surface for discovering Templates and Mixins from the Template Library without leaving the editor. It lets users choose Catalog refs such as `template:<name>` and `mixin:<name>` while authoring an Atomize YAML File.

**Field Browser**:
A VS Code surface for looking up Azure DevOps Work Item fields (reference names, types, allowed values) for a selected Connection Profile.
_Avoid_: conflating with the Catalog Browser, which surfaces Template Library items rather than platform data.

**Query Browser**:
A VS Code surface for looking up saved Azure DevOps query paths for a selected Connection Profile.
_Avoid_: conflating with the Catalog Browser, which surfaces Template Library items rather than platform data.

**Workspace Default Profile**:
A VS Code workspace-scoped setting that pre-selects a Connection Profile in the Validate, Live Preview, and Generate pickers.
_Avoid_: "default profile" without qualification — the CLI has a global platform default that is unrelated.

**Validation Code**:
A stable string identifier on a fixable `ValidationWarning` that the Validation Code Action provider maps to a deterministic editor fix.
_Avoid_: conflating with `ValidationError.code`, which identifies error types rather than available fixes.

**Validation Code Action**:
An editor action that applies a deterministic fix for a fixable Validation Diagnostic. Requires the CLI to emit a structured validation code alongside the suggestion message.
