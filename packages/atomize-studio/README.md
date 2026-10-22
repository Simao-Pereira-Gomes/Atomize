# Atomize Studio

Standalone desktop application for visually authoring Atomize Templates, generating Tasks, and managing the Catalog and Connection Profiles. Templates start from one of four Starting Paths (scratch, Catalog Clone, Open (a local Atomize YAML File), or AI draft from prose) all converging on the same visual authoring surface. Produces a downloadable Atomize YAML File, or installs directly into the Catalog. See [docs/Atomize-Studio.md](../../docs/Atomize-Studio.md) for the full behavior reference.

## Install and use Studio

Download an installer for your operating system from [Studio releases](https://github.com/Simao-Pereira-Gomes/Atomize/releases?q=tag%3Astudio-v0). See the [installation guide](../../docs/Atomize-Studio.md#install) for platform requirements and your first steps.

The [Atomize website](https://atomize-docs.pages.dev/) covers shared Template concepts, the Schema Reference, and CLI and VS Code workflows. Studio-specific instructions are currently in the [Studio guide](../../docs/Atomize-Studio.md).

Studio ships as a desktop application. Its workspace package is private and is not published to npm. The prerequisites and commands below are for building Studio from source.

## Development prerequisites

### All platforms

- [Rust](https://www.rust-lang.org/learn/get-started) (stable toolchain via `rustup`)
- [Bun](https://bun.sh) ≥ 1.0

### macOS

- Xcode Command Line Tools: `xcode-select --install`

### Linux

- WebKit2GTK and build essentials: see the [Tauri prerequisites guide](https://tauri.app/start/prerequisites/#linux) for your distro.

### Windows

- Microsoft Visual Studio C++ Build Tools or Visual Studio with the "Desktop development with C++" workload.

## Development

```sh
bun install
bun run dev
```

## Build

```sh
bun run build
```

Produces a platform-native installer in `src-tauri/target/release/bundle/`.

## Releases

CI artifacts and release configuration are documented in [Studio Releases](../../docs/Studio-Releases.md).

## Type checking

```sh
bun run typecheck
```

## Linting

```sh
bun run lint
```
