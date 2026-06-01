# Atomize

Atomize turns work items into task breakdowns using reusable templates and platform adapters.

## Glossary

**Work Item**:
A platform-tracked planning item that Atomize can read, create, or link.

**Story**:
A work item selected as the parent for generated tasks.

**Task**:
A child work item produced from a template task definition.

**Template**:
A YAML-defined task breakdown recipe for matching stories.

**Mixin**:
A reusable partial template that contributes tasks during composition.

**Template Library**:
The module that owns template discovery, composition, validation entry points, and persistence across built-in, user, project, file, and remote sources.
_Avoid_: template catalog when referring to the whole library; catalog is only the named-template inventory.

**Catalog**:
The named inventory of templates and mixins available from built-in, user, and project scopes.

**Workspace Root**:
The directory Atomize treats as the boundary for project-scoped state. A Workspace Root may be marked explicitly by an `.atomize` directory or inferred from the surrounding repository when no explicit Atomize marker exists.
_Avoid_: current working directory when referring to project scope.

**Catalog Override**:
A name-collision between two catalog items of the same kind and stem name. The higher-priority source wins; the losing item is the overridden entry. Shown as `⚠ overrides:` in `atomize template list`.

**Template Lineage**:
A declared provenance relationship between a template or mixin and the catalog item it was derived from, recorded in the `origin` field (`template:<name>` or `mixin:<name>`). Lineage is informational only — it does not affect how refs are resolved and does not shadow the origin item. Shown as `↖ based on:` in `atomize template list`.
_Avoid_: using "override" for lineage; lineage is derivation, not replacement.

**Atomize YAML File**:
Any YAML file authored for Atomize, either a Template or a Mixin.

**Atomize YAML Language ID**:
The legacy VS Code language ID `atomize-yaml`; Atomize YAML files normally remain on VS Code's `yaml` language ID so the YAML language server provides schema hovers and completions.

**Durable Atomize YAML Opt-In**:
A persistent file-level signal that a YAML file is authored for Atomize, currently a `.atomize.yaml`/`.atomize.yml` filename or a first-line `# atomize-yaml` modeline.

**Session Atomize YAML Opt-In**:
An editor-session classification where the VS Code extension gives a content-detected YAML document schema-backed authoring support without changing its language ID.

**Platform Adapter**:
A concrete adapter that lets Atomize read, create, and link work items on a work tracking platform.

**Story Learner**:
The module that derives a reusable template from existing stories and their child tasks.

**Mock Story**:
A user-supplied JSON object of story field values (using `WorkItem` property names) used to simulate task generation without a platform connection. Required fields (`id`, `title`, `type`, `state`) are silently defaulted if omitted.

**Mock Preview**:
Offline task generation evaluated against a Mock Story. Produces a resolved task list — including skipped conditional tasks and estimation breakdowns — without querying or creating work items on any platform.

**Live Preview**:
Task generation dry-run evaluated against a real Story fetched from a Platform Adapter. Produces a resolved task list without creating work items on any platform.
_Avoid_: "live run" — Live Preview never creates tasks.

**Connection Profile**:
A named set of credentials for a specific platform (Azure DevOps or GitHub Models). Each platform type has its own independent default profile.
_Avoid_: "auth profile" or "credentials" when referring to a saved named connection.

**Profile Management Surface**:
The VS Code extension command (`Atomize: Manage Profiles`) for creating, removing, testing, rotating, and setting the default Connection Profile.
_Avoid_: conflating this with the **Configuration Entry Point**, which opens extension settings rather than managing credentials.

**Offline Validation**:
Template validation that checks structure only, without connecting to any platform. Runs without credentials and produces results immediately.
_Avoid_: "local validation" or "structural validation" when referring to this mode.

**Online Validation**:
Template validation that connects to Azure DevOps via a named Connection Profile to verify custom field existence, condition field references, and saved query existence — checks that Offline Validation cannot perform.
_Avoid_: "connected validation" or "ADO validation" when referring to this mode.

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
A VS Code surface that opens Atomize extension settings.
_Avoid_: onboarding, walkthrough, docs link when referring to settings discovery.

**Field Hover Description**:
Schema-backed explanatory text shown by the editor for an Atomize YAML field while authoring.

**Generate Panel**:
VS Code webview panel that drives Task generation from a Template against a live Platform Adapter.

**Mock Preview Panel**:
VS Code webview panel that drives Mock Preview — shows a dynamic form derived from `--inspect`, collects a Mock Story, and renders the resolved task list on submit.

**Live Preview Panel**:
VS Code webview panel that drives Live Preview — prompts for a Story ID and Connection Profile, then renders the resolved task list with story context.

**Resolved Template**:
The fully composed form of a Template after applying `extends` inheritance and Mixin injections.
_Avoid_: "merged template" or "expanded template".

**Catalog Browser**:
A VS Code surface for discovering Templates and Mixins from the Template Library without leaving the editor.
It lets users choose catalog refs such as `template:<name>` and `mixin:<name>` while authoring an Atomize YAML File.

**Field Browser**:
A VS Code surface for looking up Azure DevOps work item fields (reference names, types, allowed values) for a selected Connection Profile.
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

**Editor Handoff**:
An opt-in CLI action that opens a saved Atomize YAML File in the user's editor after successful creation or installation, while the CLI remains responsible for template creation, installation, validation, persistence, and catalog lifecycle.
