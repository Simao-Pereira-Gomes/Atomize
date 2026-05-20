# VS Code extension authoring surface

## Context

The VS Code extension exposes authoring tools for Atomize YAML files: schema autocomplete, validation diagnostics, CodeLens commands, mock preview, snippets, and webview panels. These features need consistent boundaries so generic YAML files are not affected and Atomize Templates and Mixins receive the same support.

## Decision

The extension treats every `atomize-yaml` file as an Atomize YAML file, whether it is a Template or a Mixin.

- CodeLens commands appear on line 1 for both Templates and Mixins. Mixins are validatable; mock preview on a Mixin reflects the fields referenced by its tasks.
- Panel-based features share one `AtomizePanel` WebviewPanel host. Validation results, mock preview, and future views render as distinct views inside that host.
- Save-time validation is passive: it updates VS Code diagnostics only. The validation panel is opened by explicit user commands, not by saving a file.
- The explicit validation command opens the validation panel after refreshing diagnostics, giving users an intentional full report with grouped errors, warnings, and suggestions.
- The explicit validation command reveals the validation panel every time, while preserving editor focus.
- Diagnostics are the primary day-to-day validation surface. The validation panel is a secondary report surface for the full validation result.
- Validation errors and warnings are both surfaced as VS Code diagnostics using their corresponding severities.
- Diagnostic messages stay concise and use the validation message only; suggestions are shown in the validation report.
- Code Actions for validation suggestions are deferred to a later version.
- Strict mode can make warnings fail validation, but warning diagnostics remain warning severity; strictness is reflected in the validation result, not by changing diagnostic severity.
- The validation report title says `Strict Validation Failed` when a strict-mode run fails with warnings but no errors; the summary line keeps the normal count-and-mode format.
- An already-open validation panel is not updated by save-time validation; it remains the last report explicitly requested by the user.
- Save-time opt-out cleanup does not close or clear the validation panel; the panel remains the last report explicitly requested by the user.
- CLI-backed validation runs on save and explicit command only. Live typing feedback is left to YAML schema diagnostics.
- Save-time CLI validation runs only for durable Atomize YAML opt-in files: `.atomize.yaml`, `.atomize.yml`, `# atomize-yaml`, or documents already assigned the `atomize-yaml` language ID.
- Explicit command palette validation may run for content-detected session opt-in files because the user intentionally requested Atomize validation for the active document.
- Save-time handling clears Atomize diagnostics and validation run state when a document no longer qualifies for Atomize tooling.
- Content-only detection may attach schema-backed authoring support for the current editor session without changing the document's language ID. The document receives schema association, hover descriptions, and autocomplete, but not CodeLens actions or save-time CLI validation.
- Content-only detection also warns and offers durable opt-in through rename or modeline so full Atomize tooling is available and stable outside the current session. The rename action (`Rename to .atomize.yaml`) is the primary recommended choice; the modeline is the secondary option for files that cannot follow the naming convention.
- Adding a modeline from the warning immediately enables durable Atomize tooling while keeping the open document on the `yaml` language ID.
- Renaming from the warning opens the renamed `.atomize.yaml` file and keeps it on the `yaml` language ID.
- The durable opt-in warning is shown at most once per document URI per extension session.
- CodeLens actions are shown only for durable Atomize YAML opt-in files.
- YAML schema association is applied to durable Atomize YAML opt-in files and content-detected session opt-in files.
- Save-time validation and explicit validation use the same CLI validation mode resolution.
- CLI-backed validation validates saved file content, not unsaved editor buffers.
- When explicit validation is requested for a dirty document, the extension asks whether to save and validate, validate the saved version, or cancel.
- The command palette title remains concise as `Atomize: Validate`; the CodeLens label says `Atomize: Validate and Show Report` because it opens the validation panel.
- The extension exposes a command palette-only **Configuration Entry Point** as `Atomize: Open Settings`; it opens the full Atomize extension settings filter rather than a single setting.
- Passing validation on save is silent apart from clearing diagnostics; no success notification or status item is shown.
- Validation findings do not produce notifications during normal authoring. Notifications are reserved for operational failures such as a missing CLI or validation runner failure.
- Validation runner failures leave existing diagnostics unchanged and show an operational warning.
- Save-time validation runner failure warnings are shown at most once per document URI per extension session, then become eligible again after a successful validation run.
- Explicit validation runner failures always show an operational warning.
- Validation runner failures do not render synthetic validation reports in the panel; the panel only shows actual validation results.
- Validation reports include a local last-run time because the panel is not updated by passive save-time validation.
- Save-vs-command validation orchestration is left to a future VS Code extension integration test pass; current unit coverage focuses on pure language detection.
- Webviews use VS Code CSS variables so they follow the active editor theme.
- Snippets are registered for `yaml` and use the `atm-` prefix convention so they remain available while Atomize files stay on the YAML language service.
- Core snippets stay minimal and runnable. Optional metadata, estimation, validation, assignment, dependencies, tags, acceptance criteria, custom fields, and platform-specific fields live in dedicated snippets or schema autocomplete.
- Field hover descriptions come from `.describe()` calls in `src/templates/schema.ts`, then flow into the generated JSON Schema. The generated schema is not hand-patched.

## Consequences

- Registering snippets for `yaml` exposes `atm-` snippet prefixes in generic YAML files, but that is less harmful than moving Atomize files off the YAML language service. CodeLens remains predicate-scoped to Atomize YAML files.
- Using a custom editor language ID for durable files prevents Red Hat YAML hover descriptions and completions from attaching reliably.
- Keeping snippets compact makes the first scaffold useful without turning snippets into a full schema substitute.
- Sharing one panel host avoids separate webview lifecycle code for each feature while preserving feature-specific views.
- Keeping save-time validation passive preserves the normal editor authoring loop: diagnostics and the Problems panel show issues without moving focus or opening side UI.
- Keeping the explicit validation command panel-backed preserves a richer report surface without making every save disruptive.
- Revealing the validation panel on every explicit validation command matches the user's intent to see the report while preserving editor focus.
- Keeping the validation panel as a secondary report surface distinguishes line-level authoring feedback from a file-level validation report.
- Surfacing warnings as diagnostics keeps non-blocking authoring feedback visible in the normal editor loop.
- Keeping suggestions in the report avoids noisy squiggle hovers while preserving richer guidance in the explicit surface.
- Deferring Code Actions avoids presenting free-form suggestion text as deterministic edits before fixable validation codes are designed.
- Preserving warning severity in strict mode keeps issue type separate from validation pass/fail policy.
- Naming warning-only strict failures explicitly in the title explains the failed result without duplicating that explanation in the summary.
- Treating the validation panel as the last explicitly requested report avoids hidden changes to a secondary surface during passive saves.
- Leaving the panel unchanged during opt-out cleanup preserves the explicit-report contract.
- Limiting CLI-backed validation to save and command avoids process churn and stale reports while a user is mid-edit; schema diagnostics cover the live authoring loop.
- Requiring durable opt-in for save-time CLI validation prevents Atomize commands from running against arbitrary YAML files while still allowing content detection to provide low-risk authoring support for likely Atomize files.
- Allowing command palette validation for content-detected files preserves a deliberate "validate this as Atomize YAML" workflow before the user adds a durable marker.
- Clearing diagnostics on opt-out prevents stale Atomize squiggles from remaining after a file stops being an Atomize YAML file.
- Immediate schema reclassification after adding a modeline makes durable opt-in take effect without requiring the user to reopen the file.
- Presenting rename before modeline in the durable opt-in warning nudges users toward the canonical `.atomize.yaml` convention, which is formatter-proof and consistent with CLI-saved templates; the modeline remains available as the second option for constrained files.
- Opening the renamed file keeps the editor focused on the document the user just opted into.
- Session-scoped warning suppression avoids repeated prompts without adding persistent dismissal state before it is needed.
- Requiring durable opt-in for CodeLens keeps action surfaces off plain YAML files unless the user has marked them as Atomize YAML.
- Allowing session opt-in for schema association gives likely Atomize YAML files hover descriptions and autocomplete without treating a heuristic match as permission to run commands.
- Keeping validation mode resolution identical between save and command prevents diagnostics from disagreeing with the explicit report.
- Validating saved file content keeps extension validation aligned with the CLI's file-path contract and avoids temporary-file semantics.
- Prompting on dirty explicit validation avoids silently reporting stale saved content while leaving control over saving with the user.
- Keeping the CodeLens label explicit sets correct expectations at the in-editor click target without renaming the stable command.
- Keeping the configuration entry point command palette-only makes extension settings discoverable without adding file-level CodeLens noise to Atomize YAML authoring.
- Silent success keeps the save-time loop quiet and avoids introducing another validation state surface before it is needed.
- Keeping validation findings out of notifications avoids treating expected authoring mistakes as interruptive events.
- Keeping diagnostics unchanged on runner failure avoids falsely implying the file is valid when validation did not complete.
- Throttling runner failure warnings prevents repeated save-time interruptions while still surfacing that validation is not running.
- Explicit validation bypasses warning throttling so a user-requested command never appears to do nothing.
- Keeping runner failures out of the validation panel avoids conflating tooling failures with Atomize YAML validation results.
- Showing the local report time makes stale explicit reports visible during the editor session without treating the panel as an audit record.
- VS Code event wiring, diagnostics collections, Webview reveal behavior, dirty documents, and notifications are better covered by the extension test harness than by unit-level mocks.
