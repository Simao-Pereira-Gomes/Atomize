# Core module boundaries

## Context

Several Atomize services have grown enough behavior that their internal seams need to be explicit: template learning, Azure DevOps adapter behavior, and report file formatting. Keeping these boundaries documented as domain context made `CONTEXT.md` too implementation-heavy.

## Decision

Keep orchestration entry points thin and move deterministic work into focused modules.

**Story Learner** internals live under `src/services/template/`:

- `pattern-detection.ts` owns pattern detection infrastructure.
- `confidence-analysis.ts` owns confidence and outlier scoring.
- `learned-template-product.ts` builds learned templates from analysis results.
- `learning-session.ts` orchestrates one learning run.
- `story-learner.ts` is the public-facing entry point.

**Azure DevOps Platform Adapter** internals live under `src/platforms/adapters/azure-devops/`:

- `work-item-mapper.ts` owns pure work item mapping functions.
- `task-patch-builder.ts` owns pure JSON Patch builders for task creation and dependency links.
- `work-item-query.ts` owns WIQL query construction.
- `azure-devops-field-schema.service.ts` owns field schema caching.
- `azure-devops.adapter.ts` orchestrates the adapter and implements `IPlatformAdapter`.

**Report Formatting** lives in `src/core/report-formatter.ts`:

- `sanitizeReport` and `writeReportFile` are extracted from CLI command flow so report output is testable without prompts.

## Consequences

- The public learner surface remains `StoryLearner` plus its types.
- Adapter behavior can be tested through pure mapping, patch-building, and query-building functions without requiring Azure DevOps calls.
- CLI report output can be tested as core behavior instead of prompt-driven command behavior.
