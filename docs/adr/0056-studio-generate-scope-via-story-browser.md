# Generate Scope is chosen by browsing real Stories, not a blind ID list

Atomize Studio's Generate Area scopes a run — Live Preview or Execute alike — through a new `generate_query_stories` sidecar RPC wrapping `atomize-core`'s existing `queryWorkItems(filter)` platform call (already a standalone step inside `atomize()`, not fused with task calculation). The user picks specific Stories from the real, matching results (`GenerateScope = { kind: "stories"; storyIds }`) or leaves the Template's filter as the scope for a full batch run (`{ kind: "filter" }`). Neither the CLI nor the VS Code extension offer this — both scope a run via a blind Story-ID text input (VS Code's `generate-panel.ts`) or CLI flags, with no preview of what will actually match before committing to a scope.

## Consequences

Because filter-scoped runs can match an unbounded number of Stories, live execution also streams `atomize-core`'s existing per-task `ProgressEvent` stream to the UI as a new Tauri event (mirroring the existing `ai-draft-progress` channel), rather than only reporting a final result the way Mock Preview does.
