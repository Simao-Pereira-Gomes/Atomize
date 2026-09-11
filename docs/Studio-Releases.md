# Atomize Studio releases

How a Studio release is cut (version bump, `studio-v<version>` tag sentinel, generated release notes) is the same tag-sentinel flow as the other surfaces — see [Releasing.md](Releasing.md). Studio's version bump must land in **both** `packages/atomize-studio/package.json` and `packages/atomize-studio/src-tauri/tauri.conf.json`; the pipeline asserts they match. This page covers what is specific to Studio.

## Builds and checks

Pushing to `main` runs `.github/workflows/publish-studio.yml` and uploads downloadable installer artifacts for macOS (Apple Silicon and Intel), Windows, and experimental Linux. Those artifacts are retained for 14 days; the GitHub Release assets are the durable distribution channel.

Every build job first runs `cargo clippy --all-targets -- -D warnings` and `cargo test` against `packages/atomize-studio/src-tauri`, alongside the JS/TS `bun run test && typecheck && lint` checks, so a Rust regression in the credential store or sidecar relay fails the job before anything is bundled. PRs that touch `src-tauri` run the same checks across Linux, Windows, and macOS via `.github/workflows/validate-studio-rust.yml`.

## Release assets

A published release attaches macOS `.dmg` (Apple Silicon and Intel), Windows `.exe` and `.msi`, and `SHA256SUMS.txt`. Linux `.AppImage` and `.deb` assets are attached only if their experimental lane succeeds; its failure does not block the release. The generated release notes carry an "Installer verification" section appended after the changelog.

## Security model

This pipeline intentionally has no paid signing credentials or protected release environment. macOS installers use ad-hoc signing only to avoid Apple Silicon treating a downloaded app as damaged; they are not notarised and do not establish a trusted developer identity. Windows installers are unsigned. Users may see platform security warnings and must verify their download with `SHA256SUMS.txt` before installing.

Provenance attestations will be added with the forthcoming immutable-action pinning sweep.

If trusted distribution becomes financially viable later, use an Apple Developer ID certificate plus notarisation for macOS and a managed signing service for Windows. Those changes require revisiting this document and ADR-0059.
