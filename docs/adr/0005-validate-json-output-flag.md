# `--output json` flag on `atomize validate`

The VS Code extension needs to shell out to the CLI and consume validation results programmatically. The CLI currently emits only chalk-formatted human-readable output, which is unparseable from a `child_process.spawn` call.

Rather than implement a Language Server Protocol daemon (which would require a persistent process, an LSP client in the extension, and a full request/response lifecycle), we added `--output json` to `atomize validate`. When this flag is present, the command emits a single `ValidationResult` JSON object to stdout and suppresses all human-readable output (banner, chalk formatting, outro). The exit code remains non-zero on validation failure so CI pipelines can use the flag without losing a fast-fail signal.

`--output json` implies `--quiet` — callers do not need to pass both flags. This prevents accidental stdout pollution from non-essential prints breaking `JSON.parse`.

The emitted shape is the existing `ValidationResult` type (`{ valid, errors, warnings, mode }`), with no additions. Each `ValidationError` and `ValidationWarning` carries a dot-notation `path` string (e.g. `tasks[0].condition`); the extension resolves these to line ranges by scanning the document text, not by requiring the CLI to embed source positions.

**Considered options:** A Language Server Protocol daemon was evaluated and rejected — it would give precise per-character diagnostics but adds a persistent process, LSP client wiring, and significant ongoing maintenance for what is currently a single validation command. The shell-out approach reuses the existing CLI surface and is trivially replaceable with an LSP if requirements grow.
