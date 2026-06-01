# VS Code Generate panel confirmation flow

`Atomize: Generate` uses a dedicated scripted webview panel rather than the static validation `AtomizePanel`. Generation first runs a dry run with the selected Azure DevOps Connection Profile, renders the dry-run report, then requires an explicit panel action plus a final VS Code modal confirmation before re-running `atomize gen` with `--execute --auto-approve`; this keeps task creation reachable from the editor while preserving a clear boundary between previewing and creating Tasks.

The panel exposes a default-off `Continue on error` checkbox for live execution. Dry runs do not use `--continue-on-error`; the checkbox affects only the execute command, and the final modal confirmation must state when continuing after story-level errors is enabled.
