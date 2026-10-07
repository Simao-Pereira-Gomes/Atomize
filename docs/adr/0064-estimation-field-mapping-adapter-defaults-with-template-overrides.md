# Estimation Field Mapping: adapter-owned defaults, Template overrides, core never names platform fields

Task generation used to hardcode Azure DevOps estimation fields throughout: the Story Estimate was read from `StoryPoints` falling back to `OriginalEstimate` (silently missing Scrum's `Effort` and CMMI's `Size`), every Task was created as `"Task"`, and the calculated number was written to `RemainingWork`/`OriginalEstimate` with `CompletedWork = 0`. That implied an undeclared 1:1 conversion from points to hours, and it gave the upcoming Jira and Linear adapters nothing to implement. We split ownership into two layers. Each Platform Adapter supplies a default Estimation Field Mapping for its platform, through `IPlatformAdapter`: an ordered fallback chain of Story fields, the child Work Item type, and the Task target fields together with the wire encoding of those fields (for example, Jira time-tracking stores seconds). A Template may override any part of it in the platform's own field names (`estimation.source`, `taskType`, `estimation.targetFields`), as ADR 0061 requires. Core works only with an abstract Story Estimate in and Task Estimate out, converted by an optional Estimation Conversion (factor or table, 1:1 when absent) before the percentage split, and it never names a platform field.

Overrides are deliberately less forgiving than defaults. An overridden `source` is a single field with no fallback, because falling back from `Custom.TShirtSize` to `StoryPoints` would silently mix units. An overridden `targetFields` replaces the default list entirely, `CompletedWork` included, so a custom child type without those fields doesn't fail at creation time. Override fields are written exactly as calculated, because Atomize cannot know a custom field's unit.

## Considered Options

- **Every Template declares its fields explicitly, with no adapter defaults.** This is the simplest model, but it breaks every existing Template and makes the common case verbose.
- **Keep the defaults in core with a per-platform switch.** This is what the code did implicitly. It puts platform knowledge in core and gives new adapters no seam to supply their own conventions.
- **Override fallback chains, matching the defaults.** Rejected because a blank custom field should surface as an Unresolvable Story Estimate, not quietly read a field in a different unit.

## Consequences

- `WorkItem.estimation` becomes `number | string`, and `WorkItemType` becomes an open string, so categorical Story Estimates and non-ADO child types (Jira `Sub-task`) can pass through.
- `field: estimation` in conditions keeps meaning the **raw** Story Estimate (read from the overridden `source` when there is one), not the converted value. Existing conditions are unaffected. A numeric operator against a non-numeric Story Estimate is a condition evaluation error, and Online Validation warns about it.
- Mock Previews follow `source` too: an overridden source is read from the Mock Story's `customFields`, so a wrong `source` shows up in preview rather than first appearing in a live run.
- Preview and report labels are unit-neutral, except for an adapter's default target fields, whose unit the adapter knows and labels.
- Priority still assumes ADO's 1–5 scale. Its cross-platform semantics are deferred until a second adapter needs them.
