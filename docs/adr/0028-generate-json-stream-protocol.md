# Generate JSON stream protocol

> No longer applicable per ADR-0038/#142: the Generate panel now calls `Atomizer.atomize()` in-process and passes its `onProgress` callback straight to `panel.webview.postMessage`. There is no CLI subprocess and no stdout to frame NDJSON over, so the envelope this ADR describes doesn't exist anymore — nothing replaced it, the process boundary that motivated it is simply gone.

The VS Code Generate panel shows no progress during live task creation — the webview stays frozen on a spinner until the CLI exits and emits its final JSON blob. To show live counters (stories completed, tasks created), the CLI gains a `--json-stream` flag that emits NDJSON to stdout during execution.

## Decision

`atomize gen --json-stream` writes one JSON line per event to stdout as execution proceeds, then writes the final `AtomizationReport` as the last line. Every line uses a typed envelope:

```
{ "event": "progress", "data": <ProgressEvent> }
{ "event": "report",   "data": <AtomizationReport> }
```

The existing `--json` flag is unchanged — it continues to emit a single JSON blob on exit. `--json` covers dry-run calls from the extension; `--json-stream` covers live-execution calls.

Progress events emitted are `story_start`, `story_complete`, `story_error`, and `task_created`. Per-task events require an `onTaskCreated?: (task: WorkItem) => void` callback added to `createTasksBulk` on the `GenerationPlatform` interface, threaded through `TaskMaterializer` → `StoryProcessor` → `StoryBatchProcessor` → `Atomizer`.

The VS Code extension's `GeneratePanel` reads the stream line-by-line, sends `panel.webview.postMessage` on each progress line to update counter text nodes in place, and only replaces the full panel HTML on the final `report` line. The running-phase HTML is rendered once with counter elements that have known IDs; the postMessage handler patches only those nodes.

## Why not stderr for progress

Stderr is already treated as an error signal by the extension's `spawnJson` error path. Mixing progress events into stderr would require the extension to distinguish error output from progress output on the same channel. Stdout is cleaner: one channel, one framing convention.

## Why typed envelope over shape discrimination

`AtomizationReport` has no `type` field today, so checking `"type" in line` would work now. But the envelope makes the contract explicit and immune to future schema additions to either type. Any consumer checks `line.event` first; the payload shape follows from that.

## Why dry run is excluded

The dry-run latency is dominated by a single `queryWorkItems` call — there is no per-story write loop to observe. A loading spinner is sufficient. Keeping dry run on `--json` avoids changing a stable, tested code path.
