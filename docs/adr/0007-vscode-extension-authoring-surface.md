# VS Code extension authoring surface

The extension scopes Atomize behavior with two tiers of opt-in, matching the file identification contract from ADR-0002 and ADR-0006:

- **Durable opt-in** (`.atomize.yaml`, `.atomize.yml`, `# atomize-yaml` modeline) enables the full authoring surface: CodeLens, save-time CLI validation, and schema association.
- **Session opt-in** (content detection) enables schema association only — no CodeLens, no save-time CLI validation. Content-detected files receive a one-per-session prompt to add a durable marker.

**Save-time validation is passive.** It updates VS Code diagnostics only; it never opens a panel or moves editor focus. The explicit `Atomize: Validate` command opens the Validation Report panel. The panel shows only results from explicit runs — passive saves never update an open panel.

**CLI validation runs only on save and explicit command** — not on live typing. Schema diagnostics cover the live authoring loop; CLI process churn between keystrokes is avoided.

**CLI validation uses saved file content**, not the unsaved editor buffer. When the user explicitly validates a dirty document, the extension prompts to save first.

**Snippets are registered for the `yaml` language**, not a custom language ID, so they remain available while Atomize files stay on the YAML language service. This exposes `atm-` prefixes in generic YAML files, which is less harmful than moving Atomize files off Red Hat YAML's schema service.

**Refined by:** ADR-0011 (Validation Profile Selection), ADR-0013 (Mock Preview Panel), ADR-0014 (Live Preview Panel), ADR-0015 (command titles and scope).
