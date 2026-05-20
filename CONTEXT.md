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

**Validation Diagnostics**:
Line-level editor feedback for an Atomize YAML File, surfaced through VS Code diagnostics such as squiggles and the Problems panel.

**Validation Report**:
A file-level summary of an Atomize YAML File validation run, including grouped errors, warnings, and suggestions.

**Field Hover Description**:
Schema-backed explanatory text shown by the editor for an Atomize YAML field while authoring.

## Relationships

- A **Template** selects one or more **Stories** and defines one or more generated **Tasks**.
- A **Mixin** contributes tasks to a composed **Template**.
- The **Template Library** resolves **Templates** and **Mixins** from the **Catalog** or direct template sources.
- A **Platform Adapter** reads **Stories** and creates or links **Tasks**.
- The **Story Learner** reads **Stories** and **Tasks** through a **Platform Adapter** and produces a **Template**.
- A **Mock Preview** evaluates a **Template** against a **Mock Story** to produce a resolved task list without a **Platform Adapter**.
- **Validation Diagnostics** point to specific locations in an **Atomize YAML File**; a **Validation Report** summarises the whole validation result.
- **Validation Diagnostics** may refresh passively while authoring; a **Validation Report** is only shown after an explicit user request.
- **Durable Atomize YAML Opt-In** identifies an **Atomize YAML File** for full editor tooling while preserving the `yaml` language identity; **Session Atomize YAML Opt-In** identifies one for schema-backed authoring support and durable opt-in prompting only.
- A **Field Hover Description** is available for every schema-enabled **Atomize YAML File**, whether identified by **Durable Atomize YAML Opt-In** or **Session Atomize YAML Opt-In**.
- A **Catalog Override** is detected automatically by name collision; **Template Lineage** is declared explicitly via the `origin` field and is informational only.

## Flagged Ambiguities

- "template catalog" was used for both named inventory and all template loading behavior; resolved: **Catalog** is the inventory, **Template Library** is the whole module.
