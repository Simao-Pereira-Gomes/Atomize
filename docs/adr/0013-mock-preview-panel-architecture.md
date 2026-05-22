# Mock Preview Panel as a separate panel with re-inspect-on-reopen

The Mock Preview Panel needs `enableScripts: true` for form-to-extension message passing; the existing `AtomizePanel` is intentionally script-free (simpler CSP, static HTML). Extending `AtomizePanel` to support both modes would couple two panels with fundamentally different interaction contracts. A dedicated `PreviewPanel` singleton is cleaner and keeps the panels independent — the user can have a Validation Report and a Mock Preview Panel open simultaneously without one replacing the other.

On re-open (CodeLens clicked while a panel is already showing), the panel re-runs `--inspect` to pick up any template edits, then pre-populates the form with the last-entered mock values stored per file URI in memory. The alternatives — always reset the form (loses values on every re-click) or reveal the existing panel state unchanged (shows stale fields after a template edit) — both break the fast-iteration loop the feature is designed for.

## Alternatives considered

**Generalize `AtomizePanel` with an `enableScripts` flag**: avoids a new class but merges incompatible panel behaviors into one owner. Rejected because the script-free invariant on the validation panel is a deliberate security property, not an oversight.

**Always reveal existing panel state on re-open**: zero re-inspect cost, preserves entered values. Rejected because clicking the CodeLens after editing the template would show form fields from the old template version without any indication.

**Always reset the form on re-open**: simple, always in sync with the template on disk. Rejected because it breaks the tweak-and-retry loop — the user loses their values every time they re-click.
