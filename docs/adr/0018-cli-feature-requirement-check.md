# CLI Feature Requirement check: activation-time, hard-coded version map, pre-release comparison

The VS Code extension requires CLI >= 2.0.1 for all commands (validate, preview, livePreview, generate, manageProfiles) because the 2.0.1 release introduced the flags those commands depend on (`gen --json`, `gen --execute --auto-approve`, `preview --inspect`, `preview --mock-story`, `auth --json`). The requirement is checked once at activation — not per-command — because the CLI does not change during a VS Code session, so per-command checks would be redundant overhead. The check is distinct from the CLI Update Check: the Update Check detects that a newer version exists; the Feature Requirement enforces a minimum.

The version map is hard-coded in the extension rather than queried from the CLI (`--capabilities` or similar) because the CLI and extension are co-developed in the same monorepo; the extension always knows which CLI flag it depends on and when it was added. A dynamic capabilities endpoint would introduce a bootstrapping problem: an old enough CLI wouldn't have the endpoint either.

Version comparison uses any valid semver (stable or pre-release) rather than stable-only. `extractStableSemver` (used by the Update Check) is not reused here because a pre-release like `2.1.0-beta.1` is a parseable, comparable version that should be evaluated against the minimum. Only truly unparseable strings (dev builds, empty output) are treated as compatible and allowed through.

**Considered:** checking per-command invocation — adds no safety benefit since the CLI path is fixed for the session and `probeCli` already guards availability.
