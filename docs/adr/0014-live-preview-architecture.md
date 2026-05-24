# Live Preview architecture: `--json` stdout flag on `atomize gen` and a separate panel singleton

## `--json` flag on `atomize gen`

The VS Code extension needs to consume an `AtomizationReport` programmatically after a dry-run. `atomize gen` already owns `-o, --output <file>` for writing the report to a file path, so reusing `--output json` as a magic value (as `atomize validate` does) would be ambiguous with a file literally named `json` and would break the existing `--output <file>` mental model. A dedicated `--json` flag emits the report to stdout and implies `--quiet`; callers do not need to pass both. The exit code remains non-zero on failure so CI pipelines retain a fast-fail signal.

**Considered:** tmp file via `--output <path>` — works without a CLI change, but adds file-system coordination (cleanup on crash, permissions) for what is fundamentally a pipe.

## Live Preview Panel as a separate singleton

Live Preview and Mock Preview have different interaction flows: Mock Preview shows an inspect-derived form and allows iterative re-submission; Live Preview re-prompts for a story ID on every open and renders results directly. Sharing the `PreviewPanel` singleton (`atomize.preview`) would mean the two commands replace each other — a user cannot have offline exploration and a real-story dry-run visible simultaneously. A dedicated `LivePreviewPanel` singleton (`atomize.livePreview`) keeps them independent, consistent with ADR-0013.

**Considered:** share the `PreviewPanel` singleton — avoids a new class, but clicking either Preview command would destroy the other's state.
