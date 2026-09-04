# Studio AI drafts are cancellable through the sidecar

Atomize Studio gives each in-flight AI draft an opaque per-draft identifier and exposes a dedicated `ai.cancel` companion-process operation. The sidecar uses that identifier to abort the matching Copilot session and reports `AI_DRAFT_CANCELLED` as an expected outcome; Studio waits for the cancellation acknowledgement before restoring the unchanged prose form. This prevents a dismissed draft from continuing to consume Copilot usage without extending the normal result stream with progress notifications.

## Considered Options

Ignoring a late result while allowing the generation to continue was rejected because it consumes a user's Copilot allowance after they withdrew the request. A generic companion-process termination was rejected because it could interrupt unrelated concurrent capabilities and would make the sidecar's lifecycle recovery path carry normal user interaction.
