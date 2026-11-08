#!/usr/bin/env node
// The published CLI entry. It turns on Node's on-disk compile cache (Node 22.1+) before loading the
// bundled CLI, so later runs reuse V8's compiled code instead of recompiling the multi-megabyte bundle.
// The cache must be on before the bundle is imported; it can't enable itself from inside the bundle.
import module from "node:module";

module.enableCompileCache?.();
await import("./main.js");
