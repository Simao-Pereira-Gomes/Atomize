# `template improve` reuses the Copilot Session, grounding, and Template Diff infrastructure already built for AI drafting and Studio

#59 originally proposed `atomize template improve <template> --ai-profile my-ai`, authenticating through a stored AI Connection Profile. That concept no longer exists: the `--ai-profile` flag and `ATOMIZE_AI_PROFILE` were removed when GitHub Models was retired (Changelog `[Unreleased]`), and AI-assisted drafting now authenticates through an ephemeral, tool-free Copilot Session tied to the user's locally signed-in GitHub Copilot account (ADR-0044) — no token stored, automatic model selection, discarded after use. `template improve` adopts the same mechanism `template create --ai` already uses; there is no `--ai-profile` flag to carry forward.

**Decision: `template improve` ships on both the CLI and Atomize Studio from the start**, not CLI-only with Studio deferred. This is a different call than #52's Jira/Linear PRD, where each surface needed genuinely separate OAuth UI work — here, the expensive parts are already built and explicitly designed for reuse:

- **Grounding** reuses the curated-metadata pattern from AI drafting (ADR-0045): only necessary Story/Task fields are sent to Copilot, never raw platform payloads or credentials, matching #59's own independently-specified safety requirements exactly.
- **The proposed-changes view** reuses `diffTemplates(base, current)` (ADR-0058), a pure function with no knowledge of Catalog, origin, or lineage — origin-agnostic by design specifically so "if arbitrary two-Template comparison is ever wanted, it is a new caller plus a picker — zero engine change." `template improve`'s (current, AI-proposed) comparison is exactly that new caller.
- **Studio's grounding-story selection** reuses the Story Browser (ADR-0056) instead of requiring typed IDs — the same pattern Generate Scope already uses to pick real Stories rather than a blind ID list.

**Studio's entry point is an "Improve with AI" action available whenever a Template is loaded in the authoring surface** (regardless of which Starting Path produced it — Scratch, Catalog Clone, Open, or AI draft), not a fifth Starting Path: Starting Paths begin a new authoring session, while Improve acts on one already in progress. The result is whole-template **Accept** (replaces the current authoring state) or **Reject** (discards), matching the CLI's own Preview/Save/Save-as-new/Reject granularity — no field-level partial-apply, which neither the original issue nor Studio's existing patterns ask for.

## Considered Options

- **CLI-only, Studio as a later follow-up** — the default assumption carried over from how #58 and #52 were scoped; rejected once it was clear the Studio-side cost is unusually low here (the diff engine and grounding pattern already exist for exactly this reuse), unlike those two issues where per-surface cost was genuinely high.
- **Field-level partial-apply in Studio's diff view** — more powerful, but adds real interaction-design surface (per-task or per-field accept/reject state) neither this issue nor any existing pattern in the codebase currently supports; whole-template accept/reject is consistent with what `diffTemplates`'s existing consumer (the read-only Template Diff) and the CLI's own proposed flow both already do.
- **A stored "AI provider profile" for `template improve`**, matching the original issue's `--ai-profile` — moot once GitHub Models retirement removed the concept this issue depended on.

## Consequences

- `template improve`'s Studio UI is the second consumer of `diffTemplates`, validating ADR-0058's bet that keeping the engine origin-agnostic would make it "trivially reusable."
- If field-level partial-apply is ever wanted later (for `template improve` or the existing read-only Template Diff), it's new work in the view/orchestration layer only — the engine itself needs no change, per ADR-0058.

## Amendment (2026-10-09): the VS Code extension joins, and inheritance is preserved

The release that ships `template improve` now also brings Template Improvement and AI drafting to the VS Code extension, so all three surfaces gain them together. In VS Code the proposal is reviewed in the native diff editor rather than through `diffTemplates`. The right-hand side can be edited, Accept applies an edit that Undo can reverse, Save as New opens an untitled buffer, and Reject closes the diff. The extension never writes to the Catalog itself. `diffTemplates` moves from Studio into `atomize-core` so the CLI can use it as well.

On every surface, an improvement is judged against the Resolved Template but changes only the Template's own content. It never rewrites `extends` or Mixin references, and it adds advisory notes when an inherited Task needs attention. Proposals are written back with comments and key order preserved. Save as New sets `origin` to the source when the source is a Catalog item and leaves it out for a standalone file (ADR-0010, ADR-0037). An improvement can be steered by optional prose guidance from the user (for example "focus on estimates"). Choosing a Connection Profile brings Project Grounding, and Story Grounding is optional evidence on top, as set out in ADR-0069. The VS Code session runtime is described in ADR-0068.
