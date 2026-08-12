# Template Builder context

The Template Builder is a standalone desktop application for visually authoring Templates. It consumes the shared Atomize domain in [../../CONTEXT.md](../../CONTEXT.md).

## Glossary

**Template Builder**:
A standalone desktop application for visually authoring Templates. It supports three Starting Paths: scratch, cloning an existing Catalog item, or generating a draft from a prose description. All paths converge on the same visual authoring surface. It produces a downloadable Atomize YAML File for manual installation via the CLI.
_Avoid_: conflating with the CLI template wizard, which is a sequential terminal-driven flow for the same purpose.

**Template Builder CLI Installation Command**:
The user-approved `npm install -g @sppg2001/atomize` command the Template Builder runs in an in-app installation console to install or update its required CLI. The console shows the command and its output; the builder rechecks CLI availability and version after the command finishes. If npm is unavailable, the console explains that users may install Atomize manually with another package manager and then retry the CLI check.

**Template Builder CLI Gate**:
The exclusive launch surface that verifies the required CLI before the Template Builder authoring surface is available. It runs at app launch and after an explicit recovery action, not when the app regains focus or before every later CLI command.

**CLI Probe Failure**:
A failure to determine the availability or version of the CLI even though its executable may exist. In the Template Builder, a non-zero `atomize --version` result or output without a valid semantic version is a CLI Probe Failure; inability to start the executable is an absent CLI. A CLI Probe Failure is distinct from an absent or below-minimum CLI and offers reinstall and retry recovery actions.

**Starting Path**:
One of three entry points into the Template Builder's authoring surface: scratch, Catalog clone, or AI draft. All Starting Paths converge on the same authoring surface.

**Catalog Clone**:
A Starting Path that materialises a selected Catalog Template's Resolved Template into the Authoring Store. Its inherited and Mixin-contributed content becomes directly editable; the cloned Template does not retain `extends` or `mixins` declarations.
The clone records Template Lineage to the selected source through its informational `origin` field.

**Authoring Store**:
The single source of truth for the Template being authored in the Template Builder. The YAML preview, Review section, and Starting Path loaders all read from it.

**Task Auto-normalisation**:
An opt-in, in-memory Task Builder behavior for Percentage-mode Tasks that preserves a valid edited Task percentage and proportionally redistributes the remaining percentage among its valid sibling Tasks. It is not part of a Template and is never written into its Atomize YAML File.

**Grounded Field Options**:
Platform metadata fetched on demand through a selected Connection Profile and offered as choices for Template fields. They include filter choices (work item types, type-dependent states, teams, area paths, iteration paths, and saved queries) and Azure DevOps field schemas with their allowed values for custom fields and conditions. Grounded Field Options improve selection accuracy but never prevent manual, offline authoring.
Manually entered values remain available after grounding, profile changes, and refreshes.
_Avoid_: treating grounding as a requirement for creating a Template, or removing a manually entered value because it is absent from grounded data.

**CLI Grounding Parity**:
The Template Builder presents the same Azure DevOps-backed field choices as the interactive `atomize template create` flow. It does not restrict grounding to only the controls that happen to be visible in the Builder's initial Filter section.

**Grounding Session**:
The transient selection of a Connection Profile in the Template Builder used to fetch Grounded Field Options. A Grounding Session is not part of a Template and is never written into its Atomize YAML File.

**Authoring-Time Grounding**:
Using Grounded Field Options while authoring to reduce invalid platform-specific values. It does not provide exhaustive Online Validation of a completed Template.

**Grounding Service**:
The Template Builder capability that manages a Grounding Session and retrieves Grounded Field Options for present and future authoring controls. The first consumer set is the Filter section; custom-field and condition controls adopt it when those controls are introduced.

**Work Project Setting**:
The Template Builder's global header setting for choosing the Connection Profile used by the current Grounding Session. It uses non-technical language and applies choices across the Builder without becoming part of the Template.
