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

**Atomize YAML File**:
Any YAML file authored for Atomize, either a Template or a Mixin.

**Atomize YAML Language ID**:
The VS Code language ID `atomize-yaml`, used for Atomize YAML files.

**Durable Atomize YAML Opt-In**:
A persistent file-level signal that a YAML file is authored for Atomize, currently a `.atomize.yaml`/`.atomize.yml` filename or a first-line `# atomize-yaml` modeline.

**Session Atomize YAML Opt-In**:
An editor-session classification where the VS Code extension promotes a content-detected YAML document to the `atomize-yaml` language ID.

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

## Relationships

- A **Template** selects one or more **Stories** and defines one or more generated **Tasks**.
- A **Mixin** contributes tasks to a composed **Template**.
- The **Template Library** resolves **Templates** and **Mixins** from the **Catalog** or direct template sources.
- A **Platform Adapter** reads **Stories** and creates or links **Tasks**.
- The **Story Learner** reads **Stories** and **Tasks** through a **Platform Adapter** and produces a **Template**.
- A **Mock Preview** evaluates a **Template** against a **Mock Story** to produce a resolved task list without a **Platform Adapter**.
- **Validation Diagnostics** point to specific locations in an **Atomize YAML File**; a **Validation Report** summarises the whole validation result.
- **Durable Atomize YAML Opt-In** and **Session Atomize YAML Opt-In** both identify an **Atomize YAML File** for editor tooling; durable opt-in survives editor sessions.

## Flagged Ambiguities

- "template catalog" was used for both named inventory and all template loading behavior; resolved: **Catalog** is the inventory, **Template Library** is the whole module.
