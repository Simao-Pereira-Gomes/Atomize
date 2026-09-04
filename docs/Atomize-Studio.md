# Atomize Studio

Atomize Studio is a standalone desktop application for visually authoring Templates, generating Tasks, and managing the Catalog and Connection Profiles — the desktop counterpart to the CLI and the VS Code extension. It is organised as independent Studio Areas (Templates, Generate, Catalog) rather than a single linear flow.

> Formerly named Template Builder. If you have old links, issues, or bookmarks referencing that name, they refer to the same application.

> Compatibility: Atomize Studio supports the Azure DevOps platform. AI-assisted drafting uses a locally signed-in GitHub Copilot account.

## Install

Download the installer for your platform from the project's [GitHub Releases](https://github.com/Simao-Pereira-Gomes/Atomize/releases), tagged `studio-v<version>`:

- macOS: `.dmg` (separate Apple Silicon and Intel builds)
- Windows: `.exe` or `.msi`
- Linux (experimental): `.AppImage` or `.deb`, when that build succeeds

Verify your download against the release's `SHA256SUMS.txt`. Installers are not notarised (macOS) or signed (Windows) — your OS may show a security warning before allowing the app to run. See [Studio Releases](./Studio-Releases.md) for the full publishing and security model.

Atomize Studio does not require the Atomize CLI to be installed. It bundles its own companion process and runs independently.

## First Workflow

1. Launch Atomize Studio. It starts on the **Templates** area's Starting Paths screen.
2. Choose a Starting Path: start from scratch, clone a Catalog Template, open a local Atomize YAML File, or draft one with AI from a prose description.
3. Work through the authoring sections and confirm every section validates in **Review**.
4. Export a downloadable Atomize YAML File, or use **Catalog Install** to add it directly to your Catalog.
5. Switch to the **Generate** area to run a Mock Preview, a Live Preview, or execute task creation against a real Story.

## Studio Areas

Atomize Studio has three Studio Areas, each reachable directly from the sidebar rather than as a step in a linear flow: **Templates**, **Generate**, and **Catalog**. Switching between areas does not reset in-progress authoring — an unsaved Template stays in memory until you explicitly discard it or start a new Starting Path.

**Global Settings** — appearance (Theme) and Connection Profile management — is reachable from any Studio Area rather than being a fourth area itself.

A single, persistent **Back** control (near the sidebar) pops a global navigation history of Studio Area and Starting-Path/Builder transitions. Back never discards the Template you're authoring; it is purely navigational. If Back has nothing left to return to while a draft is still in progress, the Starting Paths screen shows a "Continue your in-progress Template" banner so the draft is never stranded.

## Templates Area

### Starting Paths

Every Template you author begins from one of four Starting Paths:

- **Scratch** — start with an empty Template.
- **Catalog Clone** — materialize a selected Catalog Template's content into the authoring surface, ready to edit. The clone records where it came from in the Template's `origin` field, but does not keep `extends`/`mixins` declarations. Reachable from the Templates area's Starting Paths screen or by choosing **Clone** on a Template row in the Catalog area.
- **Open** — load a local Atomize YAML File. This is the one Starting Path that does not always detach into a new Template: saving back to the same file continues that file's identity, rather than creating something new (see [Open](#open) below).
- **AI draft** — generate a starting Template from a prose description, using GitHub Copilot (see [AI Drafting](#ai-drafting)).

Scratch, Catalog Clone, and AI draft always produce a new, detached Template with no ties to any source file. Open is the exception.

### Open

Opening a local Atomize YAML File that fails to parse, doesn't have the Template shape, or is structurally a Mixin is rejected immediately with a clear message. A file with the Template shape but invalid values still loads, showing inline errors the same way an in-progress Template would.

If the file declares `extends` or `mixins`, Studio resolves it into its fully composed form before loading — the same composition the Template Library performs for the CLI. This requires the companion process to be reachable; a plain file with no composition loads fully offline. Resolving `extends`/`mixins` also strips those fields from the loaded Template, since leaving them declared against an already-composed task list would duplicate the parent's or mixins' tasks the next time the file is opened.

Once a file is open, you get two save actions:

- **Save** writes back to the file's original path with no dialog. Available once every section validates. Because `extends`/`mixins` were already flattened at load time, saving in place — even for a single trivial edit — permanently detaches the file from its parent or mixins; it stops picking up their future changes. This is an accepted trade-off, not a bug: it's what lets you see and edit the real, composed task list.
- **Export as copy…** writes to a new path through the same save dialog every other Starting Path's export uses, and additionally strips `origin`, since a newly detached copy shouldn't claim a Catalog relationship it no longer tracks.

### Builder Sections

The authoring surface is organised into sections: Basic Info, Filter, Tasks, Estimation, Validation, Metadata, and Review. All sections must validate before you can export, install to Catalog, or (for an Open session) save.

**Task Auto-normalisation** is an opt-in behavior for Percentage-mode Tasks: editing one Task's percentage proportionally redistributes the remaining percentage among its valid sibling Tasks. It's an in-memory authoring convenience only — never written into the Atomize YAML File.

### Template Diff

The Review section shows a read-only **Template Diff** between the Template you're authoring and the Catalog item recorded in its `origin` field — what's changed since you cloned it. It's only available when `origin` still resolves to a Catalog item, so it's unavailable for from-scratch and AI-draft Templates, for an Open session exported as a copy, and when the recorded origin has since been removed from the Catalog.

The diff compares against the same raw, unresolved content Catalog Clone seeds from — not the origin's fully composed `extends`/`mixins` form. For an `extends`-based origin, this means the diff answers "what have I changed since I cloned," not "what would the origin compose to." Use [Resolved Template](./VS-Code-Extension.md#atomize-show-effective-template) or `atomize template resolve` for the composed view.

### AI Drafting

The AI draft Starting Path uses a **Copilot Session** — an ephemeral, tool-free GitHub Copilot SDK session tied to your locally signed-in Copilot account. Studio never stores a Copilot token, and each draft uses automatic model selection and is discarded once it finishes. This is a different mechanism from a Connection Profile; see the [Auth Guide](./Auth-Guide.md) for the full picture.

If you've selected a Connection Profile in the [Work Project Setting](#work-project-setting), Studio can ground the draft with curated Azure DevOps metadata — work item types, field names and allowed values, saved-query and path names — sent to Copilot alongside your prose. Your connection's access token itself is never sent. An explicitly ungrounded draft sends neither metadata nor credentials.

An AI draft that produces valid Template shape enters the authoring surface, possibly with inline field-level errors to fix; malformed or non-Template output is rejected before handoff. You can cancel an in-flight draft; Studio waits for the cancellation to be acknowledged before restoring your original prose, so a dismissed draft doesn't keep consuming your Copilot usage in the background.

## Grounding

Grounded Field Options are platform choices — work item types, type-dependent states, teams, area paths, iteration paths, saved queries, and Azure DevOps field schemas with their allowed values — fetched on demand through a selected Connection Profile and offered while authoring filters, custom fields, and conditions. Studio presents the same Azure DevOps-backed choices the CLI's interactive `atomize template create` flow does.

Grounding never blocks manual, offline authoring: you can always type a value by hand, and a manually entered value stays after grounding, a profile change, or a refresh.

The transient profile selection used to fetch Grounded Field Options and ground an AI draft is a **Grounding Session** — it's not part of the Template and is never written into the Atomize YAML File. A failed grounding request needs an explicit retry or a switch to an ungrounded draft.

### Work Project Setting

The header-level **Work Project Setting** chooses the Connection Profile used for the current Grounding Session, an AI draft, Online Validation, and Generate area runs, across the whole app. It's not part of any Template. Its explicit ungrounded state produces an AI draft without Azure DevOps context, and an explicit profile choice is required before Online Validation or a Generate run can proceed.

## Catalog Area

The Catalog Area is the single place to browse the Catalog — Templates and Mixins across Built-in, User, and Project scope.

- **Clone** — on any Template row, at any scope, starts the Catalog Clone Starting Path (see [Starting Paths](#starting-paths) above). If you have an unsaved Template open in the Templates area, Studio asks for confirmation before discarding it.
- **Catalog Install** (from the Templates area's Review step) — installs the Template you're authoring directly into your user or project Catalog, in addition to exporting a downloadable file. The install name comes from the Template's name (no separate prompt); you choose the scope at install time.
- **Catalog Remove** — removes a user-scoped Catalog item. Built-in and project-scope items can't be removed this way.

## Generate Area

The Generate Area runs a Template against real or mock data.

- **Preview Source** — the Template a Generate run uses: a Catalog Template (browsed the same way as Catalog Clone; Mixins are excluded since they can't stand alone) or a local Atomize YAML File. It's independent of whatever you're currently authoring in the Templates area — picking a Preview Source never loads it into the authoring surface, and editing your in-progress Template has no effect on it.
- **Generate Scope** — which Stories a run processes. You either pick specific, real, matching Stories fetched through the current Work Project Setting, or leave it unscoped to run against the Preview Source Template's own filter as a full batch. This is chosen fresh for each run.
- **Mock Preview** — runs offline against a Mock Story you supply, with no platform connection and no Task creation.
- **Live Execution Confirmation** — shown before every execution that would create Tasks. It names the Template, Generate Scope, and platform, and renders the dry run's resolved Task list inline — Studio has no separate Live Preview step; the dry run shown here is that preview. It defaults to not proceeding, and there is no way to bypass it for the rest of the session — this mirrors the CLI's per-invocation `LIVE MODE` confirmation exactly.

## Global Settings

Reachable from any Studio Area:

- **Theme** — appearance.
- **Connection Profile management** — add, rotate, set default, and remove Connection Profiles.

Connection Profiles are shared with the Atomize CLI through the same `~/.atomize/connections.json` file. Studio supports only OS-keyring-backed tokens: if a CLI profile uses the CLI's optional insecure keyfile fallback, rotate it — in either Studio or the CLI — before Studio can use it. See the [Auth Guide](./Auth-Guide.md) for the shared profile mechanism and how it differs by surface.

## Companion Process Recovery

Atomize Studio runs its Template Library logic through a bundled companion process, launched once at startup rather than spawned per action. If that process can't start, or exits repeatedly, Studio shows a recovery surface offering **Retry**. Your current in-memory authoring session is preserved, and offline authoring plus native Connection Profile management stay available — only companion-dependent actions (Grounding, AI drafting, Catalog operations, Generate runs, and opening a Template that needs composition) are blocked until the process recovers.

## Related Docs

- [Workflows](./Workflows.md)
- [Template Reference](./Template-Reference.md)
- [Template Creation](./Template-Creation.md)
- [Validation Modes](./Validation-Modes.md)
- [Auth Guide](./Auth-Guide.md)
- [CLI Reference](./Cli-Reference.md)
- [VS Code Extension](./VS-Code-Extension.md)
- [Studio Releases](./Studio-Releases.md)
