# Atomize Studio releases

Pushing to `main` runs `.github/workflows/publish-studio.yml` and uploads downloadable installer artifacts for macOS (Apple Silicon and Intel), Windows, and experimental Linux. Those artifacts are retained for 14 days.

Publishing is deliberate: bump Studio's version in both `packages/atomize-studio/package.json` and `packages/atomize-studio/src-tauri/tauri.conf.json`, then merge that change to `main`. The workflow creates the matching `studio-v<version>` tag and attaches macOS `.dmg`, Windows `.exe` and `.msi`, and `SHA256SUMS.txt` to a GitHub Release. Linux `.AppImage` and `.deb` assets are attached only if their experimental lane succeeds; its failure does not block the release.

## Security model

This pipeline intentionally has no paid signing credentials or protected release environment. macOS installers use ad-hoc signing only to avoid Apple Silicon treating a downloaded app as damaged; they are not notarised and do not establish a trusted developer identity. Windows installers are unsigned. Users may see platform security warnings and must verify their download with `SHA256SUMS.txt` before installing.

Each release should use conventional-commit subjects so GitHub's generated release notes remain readable. CI artifacts are retained briefly for debugging; GitHub Release assets are the durable distribution channel. Provenance attestations will be added with the forthcoming immutable-action pinning sweep.

If trusted distribution becomes financially viable later, use an Apple Developer ID certificate plus notarisation for macOS and a managed signing service for Windows. Those changes require revisiting this document and ADR-0059.
