# Extension release pipeline: git tag sentinel + version-change detection

Publishing the VS Code extension requires a different trigger model than the CLI. The CLI uses an explicit `workflow_dispatch` to create a GitHub Release, then a separate `publish.yml` that fires when that release is published. That two-step manual flow makes sense for the CLI because publishing to NPM is deliberate and infrequent.

For the extension, the goal is full automation: merging to `main` should publish without any manual step, but only when the version in `packages/vscode-extension/package.json` has actually changed.

**Chosen approach: git tag sentinel.**

After each successful publish, the workflow creates a tag `vscode-v{version}`. On every push to `main`, a lightweight `check-version` job reads `package.json` and checks whether that tag already exists. If it does, the publish job is skipped entirely. If it doesn't, the publish job runs: typecheck → lint → build → `vsce package` → `vsce publish` → GitHub Release with VSIX attached.

The version bump lives in the feature PR. Merging without bumping the version silently skips the publish — the same tag already exists.

**Considered alternatives:**

*Marketplace query* — use `vsce show sppg2001.atomize --json` to compare the live published version against `package.json`. Rejected: requires the extension to already exist on the Marketplace for all but the first publish, and adds a network dependency to the gate step. The tag sentinel is self-contained.

*Separate tag push trigger* — require a `vscode-v*` tag to be pushed manually to trigger the publish, matching the CLI's release model. Rejected: it reintroduces a manual step, defeating the automation goal. It also means two separate operations must land on `main` for each release (the code change and the tag), with no enforced ordering.

**Why not share the VSIX from `ci.yml`?**

`ci.yml` already builds and packages the extension on pushes to `main`. Reusing that artifact would require chaining via `workflow_run` or artifact download, adding latency and coupling. The publish workflow rebuilds independently — the extra build time is negligible compared to the coupling cost.
