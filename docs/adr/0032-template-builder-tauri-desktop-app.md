# Template Builder: Tauri desktop app over hosted web app or VS Code extension

Template authoring via the CLI wizard is sequential and terminal-driven. Normal users — those who need to create templates but find the CLI intimidating — have no alternative today beyond the Editor Handoff, which still produces a YAML file they must understand and edit. A visual authoring surface is needed that does not assume CLI familiarity.

Three surfaces were considered: extending the VS Code extension, a hosted web app, and a Tauri desktop app.

**Extending the VS Code extension was rejected.** The extension's identity is tooling for authors who already know what they are building — CodeLens, diagnostics, preview panels. Embedding a guided authoring wizard conflates two different user jobs and would bloat the extension's scope.

**A hosted web app was rejected.** The CLI subprocess pattern — used by the extension today for validation, preview, generation, and field/query lookups — cannot run in a browser. A web app would require either a hosted API layer that duplicates CLI logic or a frontend reimplementation of the template schema and validation. Both options create a maintenance burden and a surface for schema drift. A hosted web app also requires deployment infrastructure and ongoing maintenance.

**Chosen approach: Tauri desktop app.**

Tauri can spawn the CLI as a subprocess, identical to how the VS Code extension works today. All CLI capabilities — template creation, AI-assisted drafting, validation, connection profile resolution, catalog listing — are available without duplication. The app ships with a CLI presence check on launch; if the CLI is absent, a single install action is offered.

The Template Builder supports three starting paths — scratch, catalog clone, and AI draft from prose — all converging on the same visual authoring surface. The visual surface combines form sections (basic info, filter, estimation, validation, metadata) with a drag-and-drop task builder. A YAML preview is hidden by default and available as an opt-in toggle; the final review step always shows the full YAML before download.

**Output is a downloadable Atomize YAML File** for manual installation via `atomize template install`. Direct catalog writes are not supported at launch; the install step is the accepted handoff.

**Connection profiles are read from the CLI's stored profiles**, not managed independently. The AI-assisted path calls `atomize template create --ai` (with optional `--ground --profile <name>`) using profiles already configured via the CLI or the VS Code extension's Profile Management Surface. No separate credential storage is introduced.

**Frontend is SolidJS.** Solid's signal primitives (`createSignal`, `createMemo`) are more explicit and traceable than Svelte 5 runes for the cross-section derivations and keystroke-reactive estimation bars this app requires. The dependency graph is auditable at a glance as the form store grows. See alternatives below.

**Monorepo placement is `packages/template-builder`**, consistent with `packages/cli` and `packages/vscode-extension`.

## Alternatives considered

**Locally-spawned web server (`atomize template create --ui`)**: keeps the app offline and enables CLI subprocess calls, but requires the CLI to be installed — which contradicts the goal of serving users who avoid the CLI. Rejected because the target audience and the CLI-required audience overlap poorly.

**React over SolidJS**: React's main advantages were dnd-kit maturity and ecosystem safety. Both dissolved under evaluation: drag-and-drop is a single flat list reorder (all libraries handle it), and the team is greenfield on all three frameworks so no existing React investment exists. React's VDOM diffing also requires explicit memoisation discipline across the estimation cards on every keystroke — a cost Solid avoids structurally. Rejected.

**Svelte over SolidJS**: Svelte 5 runes (`$derived`, `$state`) close the reactivity gap to Solid for this use case. Svelte also has first-class `create-tauri-app` scaffolding and more Tauri community examples, which matters given Tauri is also greenfield. Rejected because Solid's signal primitives are more explicit: `createMemo` chains are easier to audit as cross-section derivations grow, and that traceability was preferred over Svelte's compile-time abstraction. The Tauri ecosystem gap is accepted as manageable — Tauri's IPC and plugin documentation is framework-agnostic.

**Independent connection profile storage**: would let the Template Builder work without any prior CLI setup. Rejected because it duplicates credential storage, creates divergence between the CLI, extension, and builder profiles, and adds a security surface for no gain — users who open the Template Builder likely have profiles configured already.
