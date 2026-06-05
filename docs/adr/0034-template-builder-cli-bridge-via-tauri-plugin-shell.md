# Template Builder: CLI bridge via tauri-plugin-shell over custom Rust command

The Template Builder needs to spawn the Atomize CLI as a subprocess to probe availability, check version, and invoke commands (catalog list, validate, template create, etc.). The VS Code extension does this with `child_process.spawn` directly, because it runs in Node.js. The Template Builder frontend is a WebView — direct subprocess calls from JavaScript are not possible. Subprocess spawning must cross the WebView-to-native boundary via Tauri's IPC layer.

Two approaches were considered:

**A custom Tauri command in Rust** (`#[tauri::command]`): the Rust backend spawns the subprocess, parses stdout, and returns a typed result over IPC. The TypeScript bridge calls `invoke('run_cli', args)` and maps the result to typed error classes. This gives full control over stdin, timeouts, and streaming from day one, but requires writing and maintaining Rust code for what is otherwise a straightforward JSON-output CLI.

**Chosen approach: tauri-plugin-shell.**

`tauri-plugin-shell` exposes `Command.create` in TypeScript, which Tauri executes natively. The entire bridge — argument construction, stdout parsing, error surfacing, version comparison — lives in TypeScript. No custom Rust is introduced. The five error cases (absent, version below minimum, runtime error, malformed JSON, success) are all detectable from the `ChildProcess` result returned by the plugin, so the plugin's abstraction is sufficient for the full scope of this ticket.

The bridge is two flat exported functions: `probeCli()` detects absence (`CliAbsentError`) and version violations (`CliVersionError`); `invoke(args)` runs commands and surfaces runtime failures (`CliRuntimeError`) and parse failures (`MalformedOutputError`). Named command wrappers are built on top in later tickets as the UI requires them.

**The minimum version is `2.0.1`**, matching the VS Code extension's `CLI_MINIMUM_VERSION`. The Template Builder calls the same set of CLI commands that drove that threshold (`gen --json`, `preview --inspect`, `auth --json`, etc.). The constant is defined locally in the bridge and bumped when a Template Builder-specific command requires a newer release.

Tauri plugin-shell requires each allowed program to be declared in the capabilities manifest. `atomize` is added as an allowed `Command.create` target in `capabilities/default.json`.

**Considered:** custom Rust command — adds no capability beyond what plugin-shell provides at this scope, and defers the cost of introducing Rust subprocess logic to a ticket that actually needs stdin, streaming, or timeout control.
