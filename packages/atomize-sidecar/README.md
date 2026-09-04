# Atomize Sidecar

The companion process bundled with Atomize Studio. It embeds `atomize-core` and `atomize-ai` in a standalone binary so Studio's Tauri frontend — which is not a Node/Bun process — can reach Template Library logic and AI drafting without importing them as JS packages. See [ADR-0042](../../docs/adr/0042-studio-sidecar-wire-protocol.md) for the wire-protocol design and [ADR-0034](../../docs/adr/0034-template-builder-cli-bridge-via-tauri-plugin-shell.md) for why Studio talks to a companion process at all rather than a Tauri plugin.

## Protocol

Line-delimited JSON-RPC 2.0 over stdio: the process writes a `sidecar.ready` notification on startup, then reads one JSON-RPC request per line from stdin and writes one JSON-RPC response per line to stdout (see `src/index.ts`, `src/protocol.ts`).

## Exports

Not a library — this package has no `exports` map. It's built as a standalone executable:

```bash
bun run build:standalone   # bun build src/index.ts --compile --outfile atomize-sidecar
```

`src/stage-for-tauri.ts` copies the compiled binary into `atomize-studio`'s Tauri bundle (invoked by `atomize-studio`'s `sidecar:stage` script before `dev`/`build`).

## Consumers

- `atomize-studio` — bundles the compiled binary and launches it as a companion process. This is the only consumer; nothing imports `atomize-sidecar` as a JS package.

## Dependencies

`atomize-core`, `atomize-ai` (both `workspace:*`, embedded directly).

## Scripts

```bash
bun test
bun run build:standalone
```
