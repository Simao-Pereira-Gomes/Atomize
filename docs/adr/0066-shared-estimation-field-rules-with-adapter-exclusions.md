# One estimation field rule in atomize-schema, with platform exclusions supplied by the adapter

Several places decide which platform fields may supply a Story Estimate or receive a Task Estimate:

- the CLI wizard's pickers;
- the curated grounding sent to AI drafts;
- Online Validation;
- Studio's estimation editor.

Each started with its own filter, and they drifted. Studio offered fields the CLI hid, `Custom.`-only checks hid process-defined size fields, and Task targets included picklists and ranking fields that can't or shouldn't receive hours.

The rules now live once, in `atomize-schema` (`isEstimateSourceField`, `isEstimateTargetField`, `sortEstimateFields`). That is the one package both core and Studio can import; Studio cannot depend on core.

- **A Story source** is either one of the platform's default estimate fields, or any writable numeric or single-line text field that isn't `System.*` and isn't a platform non-estimate field.
- **A Task target** is writable, numeric and not a picklist (a fractional estimate can't be written to one). It must also not be `System.*` or a platform non-estimate field.

Custom fields are listed first. Core re-exports the rules for the CLI, grounding and validation. Studio applies them to the grounded fields it receives.

The platform-specific part is a list of **non-estimate fields** supplied by each adapter through `EstimationDefaults.nonEstimateFields`. Entries ending in `.*` match a whole namespace. Azure DevOps excludes `Microsoft.VSTS.Common.*` (priority, severity, value area, stack rank, business value, ...) and the build, CMMI, code-review, feedback and test-case namespaces. That leaves `Microsoft.VSTS.Scheduling.*` and custom fields. The list reaches Studio inside the grounding's `estimation.defaults`. This keeps ADR 0064's rule that core never names platform fields.

## Considered Options

- **Keep a filter per surface.** It's what we had, and it drifted within days.
- **Put the rules in core and give Studio a copy.** Rejected for the same drift risk. Studio's copy had already diverged once.
- **An allow-list of estimate fields per platform.** It's precise for built-in processes, but it hides every custom or process-defined size field. Supporting those was the reason for this work.
- **Exclude non-estimate fields by exact name only.** We started there. It meant enumerating every field in `Microsoft.VSTS.Common.*`, and new process fields would slip through, so the list now takes namespace patterns.

## Consequences

- A team whose process stores an estimate inside an excluded namespace can't pick it from the list. They can still type its reference name ("Another field" in the CLI, "Enter a reference name instead" in Studio), and Online Validation accepts it as a source.
- Grounding from an older companion process has no `estimation` section and so no exclusion list. Studio then applies only the generic part of the rule.
- Every new adapter must supply its own non-estimate list, or its pickers will offer every writable numeric and text field.
