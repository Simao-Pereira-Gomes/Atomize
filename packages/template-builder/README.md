# Template Builder

Standalone desktop application for visually authoring Atomize Templates. Supports three starting paths — scratch, catalog clone, and AI draft from prose — all converging on the same visual authoring surface. Produces a downloadable Atomize YAML File for manual installation via `atomize template install`.

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

## Type checking

```sh
bun run typecheck
```

## Linting

```sh
bun run lint
```
