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
- Save-time CLI validation runs only for Atomize YAML opt-in files: durable opt-in via `.atomize.yaml`, `.atomize.yml`, or `# atomize-yaml`, and session opt-in via documents already assigned the `atomize-yaml` language ID.
- Save-time handling clears Atomize diagnostics and validation run state when a document no longer qualifies for Atomize tooling.
- Content-only detection may promote a document to the `atomize-yaml` language ID for the current editor session. Once promoted, the document receives schema association, CodeLens actions, and save-time validation.
- Content-only detection also warns and offers durable opt-in through rename or modeline so the classification is stable outside the current session.
- Adding a modeline from the warning immediately promotes the open document to the `atomize-yaml` language ID.
- Renaming from the warning opens the renamed `.atomize.yaml` file and promotes it to the `atomize-yaml` language ID.
- The durable opt-in warning is shown at most once per document URI per extension session.
- CodeLens actions are shown only for tooling-enabled Atomize YAML files.
- YAML schema association is applied only to tooling-enabled Atomize YAML files.
- Save-time validation and explicit validation use the same CLI validation mode resolution.
- CLI-backed validation validates saved file content, not unsaved editor buffers.
- When explicit validation is requested for a dirty document, the extension asks whether to save and validate, validate the saved version, or cancel.
- The command palette title remains concise as `Atomize: Validate`; the CodeLens label says `Atomize: Validate and Show Report` because it opens the validation panel.
- Passing validation on save is silent apart from clearing diagnostics; no success notification or status item is shown.
- Validation findings do not produce notifications during normal authoring. Notifications are reserved for operational failures such as a missing CLI or validation runner failure.
- Validation runner failures leave existing diagnostics unchanged and show an operational warning.
- Save-time validation runner failure warnings are shown at most once per document URI per extension session, then become eligible again after a successful validation run.
- Explicit validation runner failures always show an operational warning.
- Validation runner failures do not render synthetic validation reports in the panel; the panel only shows actual validation results.
- Validation reports include a local last-run time because the panel is not updated by passive save-time validation.
- Save-vs-command validation orchestration is left to a future VS Code extension integration test pass; current unit coverage focuses on pure language detection.
- Webviews use VS Code CSS variables so they follow the active editor theme.
- Snippets are registered only for `atomize-yaml` and use the `atm-` prefix convention.
- Core snippets stay minimal and runnable. Optional metadata, estimation, validation, assignment, dependencies, tags, acceptance criteria, custom fields, and platform-specific fields live in dedicated snippets or schema autocomplete.
- Field hover descriptions come from `.describe()` calls in `src/templates/schema.ts`, then flow into the generated JSON Schema. The generated schema is not hand-patched.

## Consequences

- Scoping snippets or CodeLens to `yaml` would leak Atomize behavior into generic YAML files.
- Using an unregistered language ID such as `atomize-template` would silently exclude Mixins and prevent snippets from firing.
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
- Requiring opt-in for save-time CLI validation prevents Atomize commands from running against arbitrary YAML files while still allowing trusted content detection to activate full support for likely Atomize files.
- Clearing diagnostics on opt-out prevents stale Atomize squiggles from remaining after a file stops being an Atomize YAML file.
- Immediate promotion after adding a modeline makes durable opt-in take effect without requiring the user to reopen the file.
- Opening the renamed file keeps the editor focused on the document the user just opted into.
- Session-scoped warning suppression avoids repeated prompts without adding persistent dismissal state before it is needed.
- Requiring opt-in for CodeLens keeps action surfaces off plain YAML files unless the extension has classified them as Atomize YAML.
- Requiring opt-in for schema association prevents Atomize autocomplete and schema diagnostics from appearing in plain YAML files unless they have been durably opted in or promoted for the session.
- Keeping validation mode resolution identical between save and command prevents diagnostics from disagreeing with the explicit report.
- Validating saved file content keeps extension validation aligned with the CLI's file-path contract and avoids temporary-file semantics.
- Prompting on dirty explicit validation avoids silently reporting stale saved content while leaving control over saving with the user.
- Keeping the CodeLens label explicit sets correct expectations at the in-editor click target without renaming the stable command.
- Silent success keeps the save-time loop quiet and avoids introducing another validation state surface before it is needed.
- Keeping validation findings out of notifications avoids treating expected authoring mistakes as interruptive events.
- Keeping diagnostics unchanged on runner failure avoids falsely implying the file is valid when validation did not complete.
- Throttling runner failure warnings prevents repeated save-time interruptions while still surfacing that validation is not running.
- Explicit validation bypasses warning throttling so a user-requested command never appears to do nothing.
- Keeping runner failures out of the validation panel avoids conflating tooling failures with Atomize YAML validation results.
- Showing the local report time makes stale explicit reports visible during the editor session without treating the panel as an audit record.
- VS Code event wiring, diagnostics collections, Webview reveal behavior, dirty documents, and notifications are better covered by the extension test harness than by unit-level mocks.
