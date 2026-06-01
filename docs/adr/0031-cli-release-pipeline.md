# CLI release pipeline: git tag sentinel replacing manual release + publish

The CLI previously used a two-step manual release process: `release.yml` (workflow_dispatch) created a GitHub Release, which then triggered `publish.yml` to publish to NPM. This required a human to initiate a release explicitly, separate from the code change itself.

The extension release pipeline (see ADR-0030) established a version-change detection pattern: bump the version in a PR, merge to `main`, and automation handles the rest. The CLI now uses the same pattern for consistency.

**Chosen approach: git tag sentinel, same as the extension.**

On every push to `main`, a `check-version` job reads `packages/cli/package.json` and checks whether a tag `v{version}` already exists. If not, the publish job runs: tests → package validation → build → `npm publish --provenance` → GitHub Release. The tag is created by the release action on success, marking that version as published.

The tag pattern uses `v[0-9]*` (not `v*`) when querying for the previous tag to generate the changelog. This avoids accidentally matching `vscode-v*` extension tags that also start with `v`.

**Why delete `release.yml` and `publish.yml` rather than keep them as escape hatches?**

Two publish paths create ambiguity about which is authoritative. If a publish fails mid-way, the sentinel tag won't have been created, so the automatic workflow retries on the next push to `main` — covering the recovery case without needing a manual fallback.

**First publish behaviour.**

At migration time, `package.json` was at `2.0.1` with no corresponding `v2.0.1` tag (the prior manual flow had not been run for this version). The first push to `main` after this ADR will correctly detect the missing tag and publish `2.0.1`.
