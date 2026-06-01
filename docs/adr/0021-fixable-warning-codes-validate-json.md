# Stable Fixable Warning Codes in `validate --output json`

`ValidationWarning` gains an optional `code?: FixableWarningCode` field in the `validate --output json` output. The field is absent (not `null`) on non-fixable warnings — JSON serialisation of `undefined` drops the key, so consumers test `if (diag.code)` rather than `diag.code !== null`. Only warnings with a single unambiguous mechanical fix carry a code; warnings that require human judgment (e.g. which task to adjust for an estimation overage, which duplicate id to keep) are not assigned codes.

`FixableWarningCode` is a `const` object exported from `validator.ts`, typed as its own value union. Each entry carries a JSDoc comment describing the exact YAML edit the extension should apply. Initial entries:

- `MISSING_TASK_ID` — covers both "task has `dependsOn` but no `id`" and "task is referenced by others but has no `id`". Fix: insert an `id` field with a slug derived from the task title. Both warnings share the code because the extension action is identical.
- `SAVED_QUERY_WITH_STRUCTURED_FILTER` — `savedQuery` and structured filter fields (e.g. `workItemTypes`, `states`, `tags`) are both set. Fix: remove the conflicting structured filter fields, since `savedQuery` controls which items are returned and the structured fields are silently ignored.

`ValidationError.code` — already present in the JSON output — is **not** part of this stability contract. Error codes include raw Zod enum strings (`too_small`, `invalid_type`) that are framework internals; committing to their stability would couple a major version bump to any Zod upgrade. No current error has a single unambiguous mechanical fix that a Code Action could apply without user judgment. If a future error gains one, it should be added to a `FixableErrorCode` constant under the same rules rather than being assumed stable by default.

All codes use `SCREAMING_SNAKE_CASE` for consistency with the existing `ValidationError.code` values.

**Considered:** `kebab-case` for warning codes (as in the issue spec examples) — rejected because mixing conventions in the same JSON payload (errors in `SCREAMING_SNAKE_CASE`, warnings in `kebab-case`) is the worst outcome; the extension's lookup table treats codes as opaque keys so the case style is arbitrary, and consistency within the payload is not.

**Considered:** open `code?: string` type — rejected in favour of a typed union so that adding a new code requires updating `FixableWarningCode`, enforcing the review step that the stability contract demands.

**Considered:** emitting `null` for non-fixable warnings — rejected; absent is simpler and avoids requiring consumers to handle both `undefined` and `null` as negative states.
