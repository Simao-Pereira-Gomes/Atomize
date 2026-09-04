# Atomize Studio

Standalone desktop application for visually authoring Atomize Templates, generating Tasks, and managing the Catalog and Connection Profiles. Templates start from one of four Starting Paths — scratch, Catalog Clone, Open (a local Atomize YAML File), or AI draft from prose — all converging on the same visual authoring surface. Produces a downloadable Atomize YAML File, or installs directly into the Catalog. See [docs/Atomize-Studio.md](../../docs/Atomize-Studio.md) for the full behavior reference.

## Prerequisites

### All platforms

- [Rust](https://www.rust-lang.org/learn/get-started) (stable toolchain via `rustup`)
- [Bun](https://bun.sh) ≥ 1.0

### macOS

- Xcode Command Line Tools: `xcode-select --install`

### Linux

- WebKit2GTK and build essentials — see the [Tauri prerequisites guide](https://tauri.app/start/prerequisites/#linux) for your distro.

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
