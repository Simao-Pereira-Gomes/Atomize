# atomize-core's Atomizer.atomize gains a batch-level AbortSignal

`AtomizationOptions` gains an optional `signal?: AbortSignal`, checked at the same two points `StoryBatchProcessor.process`'s existing internal `stopProcessing` flag already is: the top of the batch loop, and inside each story's async callback before it starts. This stops cancellation at batch boundaries — up to `storyConcurrency` Stories already in flight when cancel is requested still complete — rather than interrupting an individual Story mid-flight. `storyConcurrency`'s default of 3 is unchanged. Surfaced while implementing #138, whose `generate_run` sidecar RPC (`packages/atomize-sidecar/src/protocol.ts`) is updated in the same follow-up to pass its existing per-request `AbortSignal` into `atomize()` directly, replacing today's `abortable()`-around-the-outer-promise approach for that call; `adapter.authenticate()`, which runs before `atomize()` is even constructed, keeps its own separate `abortable()` wrapping since it sits outside `atomize()`'s scope.

## Considered Options

Per-story mid-flight cancellation (aborting an in-progress `queryWorkItems` or task-creation call) was rejected: it requires threading the signal into `StoryProcessor` and every platform adapter's `TaskWriter`, a much larger surface than the batch processor alone, and an aborted HTTP call doesn't guarantee the far end didn't already process it — so it wouldn't deliver a materially stronger guarantee than batch-level for the added complexity.

A custom cancellation token type was rejected in favor of the platform-standard `AbortSignal`: nothing about the requirement needs richer state than "aborted or not," and `generation-run.ts` already races `Atomizer.atomize()` against a timeout via `Promise.race` — established precedent in this codebase for external interruption of an in-flight `atomize()` call, which `AbortSignal` generalizes rather than replaces.

Tightening `storyConcurrency` to 1 for Studio's live Execute call specifically was rejected: it would permanently slow every execution to shrink an already-bounded edge case, and the Live Execution Confirmation step (ADR-0055) is the primary safety gate here, not cancellation.

A new issue standalone from #138 was rejected: Studio's Generate Area is the only caller motivating this today — the CLI has no live-cancel need (Ctrl+C kills the whole process), and the VS Code extension's Generate and Live Preview panels have no cancel affordance at all.

## Consequences

Cancellation goes from "the entire remaining run finishes regardless" to "at most the current in-flight batch completes, then it stops" — bounded but not instant. The CLI and VS Code extension are unaffected, since `signal` is additive and optional; they get no new behavior unless they choose to pass one. The platform adapter layer stays untouched — cancellation guarantees stop at the batch boundary, not inside an individual HTTP call.
