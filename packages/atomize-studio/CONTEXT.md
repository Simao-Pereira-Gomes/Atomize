# Atomize Studio context

Atomize Studio is a standalone desktop application covering visual Template authoring, task generation, Catalog management, and Connection Profile management — the desktop counterpart to the CLI and the VS Code extension. It consumes the shared Atomize domain in [../../CONTEXT.md](../../CONTEXT.md).

## Glossary

**Atomize Studio**:
A standalone desktop application organised as independent Studio Areas (Templates, Generate, Catalog). The Templates Area supports three Starting Paths — scratch, Catalog Clone, Local File Clone — plus a fourth entry point, AI draft, all converging on the same visual authoring surface. Formerly named Template Builder.
_Avoid_: Template Builder, its former name, now inaccurate since scope extends well beyond authoring; conflating with the CLI template wizard, which is a sequential terminal-driven flow for template authoring only.

**Studio Area**:
One of Atomize Studio's independent top-level areas — Templates, Generate, or Catalog — each reachable directly from the sidebar rather than as a step in a linear flow.
_Avoid_: "panel", the VS Code extension's term for its webview surfaces (Generate Panel, Mock Preview Panel, Live Preview Panel), which are commands rather than persistent sidebar destinations; "Section", the app's separate term for Templates' internal authoring steps (Basic Info, Filter, Tasks, Estimation, Validation, Metadata, Review); conflating with Global Settings, which is reachable from every Studio Area rather than being one itself.

**Global Settings**:
Atomize Studio's app-wide settings surface, reachable from any Studio Area rather than scoped to one. Hosts appearance (Theme) and Connection Profile management (add, rotate, set default, remove) — capability the Templates Area's own header previously owned before the sidebar shell introduced independent Studio Areas.
_Avoid_: treating Global Settings as a fourth Studio Area — it has no sidebar entry and is not itself a navigation destination among Templates/Generate/Catalog.

**Companion Process Recovery**:
The app-level recovery surface shown only when Studio's bundled companion process cannot start or repeatedly exits. It offers Retry, preserves the current in-memory authoring session, and leaves offline authoring and native Connection Profile management available while blocking companion-dependent actions. It is distinct from normal Studio launch and never checks for or installs an external CLI.

**Starting Path**:
One of the Templates Area's entry points into the authoring surface: scratch, Catalog Clone, Local File Clone, or AI draft. All Starting Paths converge on the same authoring surface and produce a detached, new Template; an AI draft with Template shape may enter the Authoring Store with inline field-level errors, while malformed or non-Template output is rejected before handoff.
_Avoid_: conflating with Open, which edits an existing local file in place rather than starting a new authoring session.

**Catalog Clone**:
A Starting Path that materialises a selected Catalog Template's Resolved Template into the Authoring Store. Its inherited and Mixin-contributed content becomes directly editable; the cloned Template does not retain `extends` or `mixins` declarations.
The clone records Template Lineage to the selected source through its informational `origin` field.
_Avoid_: conflating with Local File Clone, which clones from a local file rather than the Catalog and never sets `origin`.

**Local File Clone**:
A Starting Path that materialises a selected local Atomize YAML File into the Authoring Store as a detached copy, the same way Catalog Clone does for a Catalog item. It never sets `origin`: Template Lineage is a Catalog-only concept in the shared domain, so a Local File Clone records no provenance back to its source file. A file that fails to parse as YAML or lacks the top-level Template shape (no `tasks`, `name`, or `version`, or it is structurally a Mixin) is rejected outright; a file with the Template shape but invalid field values loads with inline errors, the same tolerance the Authoring Store already has for in-progress Templates.
_Avoid_: conflating with Open, which edits the source file directly instead of producing a detached copy.

**Open**:
An Atomize Studio action that loads an existing local Atomize YAML File into the Authoring Store for direct editing, saving changes back to that same file rather than producing a new one. Applies the same format-rejection and field-level tolerance as Local File Clone.
_Avoid_: conflating with Local File Clone, which produces a new, detached Template rather than editing the source file; conflating with a Starting Path, since Open continues an existing Template's identity rather than starting a new authoring session.

**Authoring Store**:
The single source of truth for the Template being authored in Atomize Studio. The Review section and Starting Path loaders read from it. Its `serialise` operation is all-or-nothing: it throws unless every section already validates, so there is no partial or incremental YAML view of an in-progress Template.

**Task Auto-normalisation**:
An opt-in, in-memory Task Builder behavior for Percentage-mode Tasks that preserves a valid edited Task percentage and proportionally redistributes the remaining percentage among its valid sibling Tasks. It is not part of a Template and is never written into its Atomize YAML File.

**Live Execution Confirmation**:
The confirmation step shown in the Generate Area before every task-creating execution, naming the Template, scope, and platform and defaulting to not proceeding. Shown on every execution with no session-level bypass, mirroring the CLI's per-invocation LIVE MODE confirmation.
_Avoid_: assuming a "don't ask again this session" affordance exists — it was deliberately rejected to keep this safeguard identical to the CLI's.

**Template Diff**:
A read-only comparison, available in the Templates Area, between a Catalog Clone (or its descendant edits) and the Catalog item recorded in its `origin` field, showing what has changed since the clone. Available only when `origin` is set, so it does not apply to Local File Clones or from-scratch Templates.
_Avoid_: conflating with Resolved Template, which shows composition output rather than a change comparison.

**Catalog Install**:
A Catalog Area action that installs an authored or generated Template directly into the user or project Catalog, in addition to exporting a downloadable Atomize YAML File for manual `atomize template install`.

**Catalog Remove**:
A Catalog Area action that deletes a user-installed Catalog item, the counterpart to Catalog Install.

**Grounded Field Options**:
Platform metadata fetched on demand through a selected Connection Profile and offered as choices for Template fields. They include filter choices (work item types, type-dependent states, teams, area paths, iteration paths, and saved queries) and Azure DevOps field schemas with their allowed values for custom fields and conditions. Grounded Field Options improve selection accuracy but never prevent manual, offline authoring.
Manually entered values remain available after grounding, profile changes, and refreshes.
_Avoid_: treating grounding as a requirement for creating a Template, or removing a manually entered value because it is absent from grounded data.

**CLI Grounding Parity**:
Atomize Studio presents the same Azure DevOps-backed field choices as the interactive `atomize template create` flow. It does not restrict grounding to only the controls that happen to be visible in the Templates Area's initial Filter section.

**Grounding Session**:
The transient selection of a Connection Profile in Atomize Studio used to fetch Grounded Field Options and ground an AI draft. A Grounding Session is not part of a Template and is never written into its Atomize YAML File; a failed selected grounding request requires an explicit retry or switch to an ungrounded draft.

**Authoring-Time Grounding**:
Using Grounded Field Options while authoring to reduce invalid platform-specific values. It does not provide exhaustive Online Validation of a completed Template.

**Grounding Service**:
The Atomize Studio capability that manages a Grounding Session and retrieves Grounded Field Options for present and future authoring controls. The first consumer set is the Filter section; custom-field and condition controls adopt it when those controls are introduced.

**Work Project Setting**:
Atomize Studio's global header setting for choosing the Connection Profile used by the current Grounding Session and an AI draft. It uses non-technical language and applies choices across the app without becoming part of the Template; its explicit ungrounded state produces an AI draft without Azure DevOps context.
