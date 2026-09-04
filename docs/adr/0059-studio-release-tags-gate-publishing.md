# Studio release pipeline and no-cost distribution

Atomize Studio builds downloadable artifacts on every push to `main`; only a `studio-v<version>` tag, matching both Studio version sources, publishes a GitHub Release. The distinct tag namespace keeps Studio separate from the CLI's `v<version>` and extension's `vscode-v<version>` releases while making continuous builds available for testing.

The release publishes separate Apple Silicon and Intel macOS DMGs, plus Windows `.exe` and `.msi` installers. Linux `.AppImage` and `.deb` assets are explicitly experimental and do not block a release if their build is unstable. Architecture-specific macOS bundles are necessary because Studio's bundled sidecar and Copilot binaries are architecture-specific.

The project cannot fund an Apple Developer membership or a Windows trusted-signing service. macOS installers therefore use ad-hoc signing only, Windows installers are unsigned, and every release includes `SHA256SUMS.txt` plus a clear warning that operating systems may prompt users before installation. Trusted signing and notarisation can be introduced later when their recurring costs are affordable.
