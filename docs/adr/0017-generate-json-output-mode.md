# Generate JSON output mode

`atomize gen --json` means machine-readable output only; it does not choose dry-run versus live execution. Generation mode is controlled by `--execute`: without it, JSON reports describe a dry run; with `--execute --auto-approve`, JSON reports describe created Tasks, and the report's `dryRun` and `tasksCreated` fields distinguish the result. This lets the VS Code Generate panel render both pre-execution and post-execution outcomes from structured data without weakening the CLI's non-interactive live-execution confirmation requirement.
