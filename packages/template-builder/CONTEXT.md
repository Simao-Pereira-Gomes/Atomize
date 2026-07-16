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
