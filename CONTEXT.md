# Atomize

Atomize turns work items into task breakdowns using reusable templates and platform adapters.

## Language

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

**Platform Adapter**:
A concrete adapter that lets Atomize read, create, and link work items on a work tracking platform.

**Story Learner**:
The module that derives a reusable template from existing stories and their child tasks.

## Relationships

- A **Template** selects one or more **Stories** and defines one or more generated **Tasks**.
- A **Mixin** contributes tasks to a composed **Template**.
- The **Template Library** resolves **Templates** and **Mixins** from the **Catalog** or direct sources.
- A **Platform Adapter** reads **Stories** and creates or links **Tasks**.
- The **Story Learner** reads **Stories** and **Tasks** through a **Platform Adapter** and produces a **Template**.

## Example Dialogue

> **Dev:** "Should the generate command know whether the template came from the catalog or a file?"
> **Domain expert:** "No. It should ask the **Template Library** for a runnable **Template** and let the library handle source details."

## Flagged Ambiguities

- "template catalog" was used for both named inventory and all template loading behavior; resolved: **Catalog** is the inventory, **Template Library** is the whole module.

## Module Structure (key seams)

**Story Learner** internal decomposition (all under `src/services/template/`):
- `pattern-detection.ts` — all detection infrastructure: PatternScoringConfig, SimilarityCalculator, DependencyDetector, TagPatternDetector, ConditionPatternDetector, FilterLearner, PatternDetector
- `confidence-analysis.ts` — ConfidenceScorer and OutlierDetector
- `learned-template-product.ts` — template construction from analysis results
- `learning-session.ts` — orchestrates the above into a single learning run
- `story-learner.ts` — the only public-facing entry point; index.ts exports only StoryLearner and story-learner.types

**Platform Adapter** (Azure DevOps, `src/platforms/adapters/azure-devops/`):
- `work-item-mapper.ts` — pure functions: `convertWorkItem`, `hasChildRelations`
- `task-patch-builder.ts` — pure functions: `buildCreateTaskPatch`, `buildDependencyLinkPatch`
- `work-item-query.ts` — pure function: `buildWorkItemWiqlQuery`
- `azure-devops-field-schema.service.ts` — schema caching
- `azure-devops.adapter.ts` — orchestrates the above; implements IPlatformAdapter

**Report Formatting** (`src/core/report-formatter.ts`):
- `sanitizeReport`, `writeReportFile` — extracted from CLI generate command; testable without prompts
