## Non-negotiable (quality gates)

### TypeScript safety

- `strict: true`
- `noImplicitAny: true` (no implicit `any` anywhere)
- prefer `unknown` over `any`, then narrow
- **Forbidden:** non-null assertion `!`
- **Avoid:** `as any` / `as unknown as T` (allowed only with a clear comment and a test proving safety)

**Null/undefined policy**

- If a value may be missing, model it (`T | undefined`) and handle it with narrowing or defaults.
- Use explicit parsing/validation at the boundary (CLI args/env/files).

## Tests are required

Any change that affects behavior must include tests (unit and/or integration).

CI must be green:

- `bun run typecheck`
- `bun run lint`
- `bun test`

## Determinism

- Avoid time/network randomness in unit tests.
- If using time or randomness, inject it or seed it.

## CLI design principles

### Separation of concerns

- Keep modules focused and decoupled

- Core logic should be **testable without touching FS/network/process**.
- IO modules should be thin wrappers around external libraries.
- No deep import chains from command handlers into random utilities—keep flows clear.

## “Edge validation” rule

Validate **as early as possible** (CLI args, env vars, config files, templates):

- Parse and validate with **Zod** at the edges.
- Convert validated inputs into strongly-typed internal objects.
- Don’t pass raw `process.env` / untyped YAML objects deep into logic.

## Exit codes and error UX

- Use consistent exit codes:
  - `0` success
  - `1` expected failure (validation/user error)
  - `2` unexpected/internal error
- Never dump raw stack traces by default.
  - Show a concise message + next steps.
  - Stack traces only behind `--debug` or `ATOMIZE_DEBUG=1`.

## Logging

- Default: user-friendly logs (minimal noise).
- Debug mode: verbose (include timings, payload sizes, file paths).
- Never log secrets (PAT tokens, API keys). Redact by default.

## No hidden side effects

- Any command that mutates things should:
  - show what it will do
  - support `--dry-run` where reasonable
  - ask for confirmation if destructive (unless `--yes` is set)

## Keep the CLI fast

- Avoid heavy work in module top-level scope.
- Lazy load expensive dependencies where it improves startup time (optional).

## Type safety rules (examples)

- Non-null assertions are forbidden

- Prefer `unknown` + narrowing

## Testing strategy (Bun test)

### Unit tests (fast)

Test pure logic:

- template parsing/validation
- task generation
- condition evaluation
- mapping/transforms
- error formatting

Use fakes/mocks for:

- filesystem
- Azure DevOps API
- Gemini client
- time

---

### Integration tests (realistic)

Test command flows end-to-end with fixtures:

- read template files
- validate presets/examples
- run `validate` command on sample inputs
