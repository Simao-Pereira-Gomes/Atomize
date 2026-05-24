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

**Catalog Override**:
A name-collision between two catalog items of the same kind and stem name in different scopes. The higher-priority scope (project > user > built-in) wins; the losing item is the overridden entry. Shown as `⚠ overrides:` in `atomize template list`.

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
The explicit user choice that precedes every VS Code validation run: a named Azure DevOps Connection Profile, Offline Validation, or — when no profiles are configured — a path to add one via the Profile Management Surface.
_Avoid_: "Default Validation Profile" for VS Code validation; the validation mode is never chosen silently by the system.

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

**Mock Preview Panel**:
VS Code webview panel that drives Mock Preview — shows a dynamic form derived from `--inspect`, collects a Mock Story, and renders the resolved task list on submit.

**Live Preview Panel**:
VS Code webview panel that drives Live Preview — prompts for a Story ID and Connection Profile, then renders the resolved task list with story context.

## Relationships

- A **Template** selects one or more **Stories** and defines one or more generated **Tasks**.
- A **Mixin** contributes tasks to a composed **Template**.
- The **Template Library** resolves **Templates** and **Mixins** from the **Catalog** or direct template sources.
- A **Platform Adapter** reads **Stories** and creates or links **Tasks**.
- The **Story Learner** reads **Stories** and **Tasks** through a **Platform Adapter** and produces a **Template**.
- A **Mock Preview** evaluates a **Template** against a **Mock Story** to produce a resolved task list without a **Platform Adapter**.
- The **Mock Preview Panel** drives **Mock Preview** in VS Code — inspects the **Atomize YAML File**, collects a **Mock Story**, and renders the resolved task list.
- A **Live Preview** evaluates a **Template** against a real **Story** fetched via a **Platform Adapter** using a named **Connection Profile**, without creating any **Tasks**.
- The **Live Preview Panel** drives **Live Preview** in VS Code.
- **Validation Diagnostics** point to specific locations in an **Atomize YAML File**; a **Validation Report** summarises the whole validation result.
- **Validation Diagnostics** may refresh passively while authoring; a **Validation Report** is only shown after an explicit user request.
- Every VS Code validation run begins with **Validation Profile Selection**; when no Azure DevOps profiles are configured, the selection offers **Offline Validation** or a path to the **Profile Management Surface**.
- A **CLI Validation Provider** produces the validation result consumed by **Validation Diagnostics** and **Validation Reports** in the VS Code extension.
- A **Configuration Entry Point** helps users configure the **CLI Validation Provider** and related extension-owned CLI behavior.
- The **Profile Management Surface** manages **Connection Profiles** via the **CLI Validation Provider**.
- **Durable Atomize YAML Opt-In** identifies an **Atomize YAML File** for full editor tooling while preserving the `yaml` language identity; **Session Atomize YAML Opt-In** identifies one for schema-backed authoring support and durable opt-in prompting only.
- A **Field Hover Description** is available for every schema-enabled **Atomize YAML File**, whether identified by **Durable Atomize YAML Opt-In** or **Session Atomize YAML Opt-In**.
- A **Catalog Override** is detected automatically by name collision; **Template Lineage** is declared explicitly via the `origin` field and is informational only.

## Flagged Ambiguities

- "template catalog" was used for both named inventory and all template loading behavior; resolved: **Catalog** is the inventory, **Template Library** is the whole module.
- "default profile" was used for both CLI connection resolution and VS Code validation behavior; resolved: VS Code uses **Validation Profile Selection**, while CLI defaults remain part of connection profile resolution.
- "atomize-template language ID" was used to mean the files that receive CodeLens; resolved: use **Durable Atomize YAML Opt-In**, not a separate language ID.
