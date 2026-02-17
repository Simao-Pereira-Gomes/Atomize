# agent.md — Atomize (TypeScript + Bun CLI)

This repository is a **TypeScript + Bun** CLI tool. The goal is: **predictable behavior, strict typing, great UX, and safe releases**.

---

## Non-negotiables (quality gates)

### TypeScript safety
-  `strict: true`
-  `noImplicitAny: true` (no implicit `any` anywhere)
-  prefer `unknown` over `any`, then narrow
-  **Forbidden:** non-null assertion `!`
-  **Avoid:** `as any` / `as unknown as T` (allowed only with a clear comment and a test proving safety)

**Null/undefined policy**
- If a value may be missing, model it (`T | undefined`) and handle it with narrowing or defaults.
- Use explicit parsing/validation at the boundary (CLI args/env/files).

### Tests are required
Any change that affects behavior must include tests (unit and/or integration).

CI must be green:
- `bun run typecheck`
- `bun run lint`
- `bun test`

### Determinism
- Avoid time/network randomness in unit tests.
- If using time or randomness, inject it (e.g., `Clock`, `IdGenerator`) or seed it.

---

## Commands (match package.json)

- Install: `bun install`
- Run CLI locally: `bun run dev`
- Build: `bun run build`
- Validate command: `bun run validate`
- Typecheck: `bun run typecheck`
- Lint: `bun run lint` (fix: `bun run lint:fix`)
- Tests: `bun test`
  - Unit: `bun run test:unit`
  - Integration: `bun run test:integration`
  - Watch: `bun run test:watch`
  - Coverage: `bun run test:coverage`
- Sanity check bundle contents: `bun run validate:package`
- Quick gate: `bun run check`

**Before publishing**
- `bun run build`
- `bun run validate:package`
- `bun run test:coverage` (preferred)
- Ensure the CLI entry is executable (postbuild handles this)

---

## CLI design principles (good software practices for a CLI)

### Separation of concerns (no “architecture ceremony”, just sane boundaries)
Keep modules focused and decoupled:

- **commands/**: command definitions + option parsing (Commander / Inquirer)
- **core/**: pure business logic (template resolution, work item generation, transforms)
- **io/**: filesystem, env, process, network calls (Azure DevOps API, Gemini, etc.)
- **validation/**: Zod schemas and parsing (templates, config, env)
- **logging/**: Winston configuration + helpers
- **format/**: output formatting, tables, pretty printing, colors
- **errors/**: typed errors + mapping to exit codes

Rules:
- Core logic should be **testable without touching FS/network/process**.
- IO modules should be thin wrappers around external libraries.
- No deep import chains from command handlers into random utilities—keep flows clear.

### “Edge validation” rule
Validate **as early as possible** (CLI args, env vars, config files, templates):
- Parse and validate with **Zod** at the edges.
- Convert validated inputs into strongly-typed internal objects.
- Don’t pass raw `process.env` / untyped YAML objects deep into logic.

### Exit codes and error UX
- Use consistent exit codes:
  - `0` success
  - `1` expected failure (validation/user error)
  - `2` unexpected/internal error
- Never dump raw stack traces by default.
  - Show a concise message + next steps.
  - Stack traces only behind `--debug` or `ATOMIZE_DEBUG=1`.

### Logging
- Default: user-friendly logs (minimal noise).
- Debug mode: verbose (include timings, payload sizes, file paths).
- Never log secrets (PAT tokens, API keys). Redact by default.

### No hidden side effects
- Any command that mutates things should:
  - show what it will do
  - support `--dry-run` where reasonable
  - ask for confirmation if destructive (unless `--yes` is set)

### Keep the CLI fast
- Avoid heavy work in module top-level scope.
- Lazy load expensive dependencies where it improves startup time (optional).

---

## Type safety rules (examples)

### Non-null assertions are forbidden
**Bad**
```ts
const org = process.env.AZDO_ORG!;
````

**Good**

```ts
const org = process.env.AZDO_ORG;
if (!org) return failUser("Missing AZDO_ORG. Set it in .env or environment variables.");
```

### Prefer `unknown` + narrowing

**Bad**

```ts
const data: any = YAML.parse(text);
```

**Good**

```ts
const data: unknown = YAML.parse(text);
const parsed = TemplateSchema.parse(data);
```

---

## Testing strategy (Bun test)

### Unit tests (fast)

Test pure logic:

* template parsing/validation
* task generation
* condition evaluation
* mapping/transforms
* error formatting

Use fakes/mocks for:

* filesystem
* Azure DevOps API
* Gemini client
* time

### Integration tests (realistic)

Test command flows end-to-end with fixtures:

* read template files
* validate presets/examples
* run `validate` command on sample inputs
* ensure outputs match snapshots / expected structures

### Requirements

* Tests must be deterministic and independent.
* Every bug fix includes a regression test.

---

## Linting & formatting (Biome)

* Run `bun run lint` before pushing.
* Use `bun run lint:fix` to auto-fix.
* Prefer clarity over cleverness.
* Avoid long functions; refactor when a function has multiple responsibilities.

---

## Release / publishing checks (npm)

Before merging a release PR:

* [ ] version bumped (semver)
* [ ] `bun run build` passes
* [ ] `bun run validate:package` passes
* [ ] `bun run check` passes
* [ ] README updated if CLI flags/behavior changed
* [ ] no secrets in docs/examples

---

## Contributing checklist

Before opening a PR:

* [ ] No implicit `any`
* [ ] No `!` non-null assertions
* [ ] Inputs validated at boundaries (Zod)
* [ ] Helpful error messages + correct exit codes
* [ ] Unit tests added/updated
* [ ] Integration tests updated if CLI output/behavior changed
* [ ] `bun run typecheck && bun run lint && bun test` all pass

---

## Quick “where does this go?” guide

* parsing/validation of templates/config/env → `validation/` (Zod)
* core task generation logic → `core/`
* Azure DevOps calls → `io/azure-devops/`
* Gemini calls → `io/ai/`
* CLI commands/options/prompts → `commands/`
* output formatting & display → `format/`
* logging setup & redaction → `logging/`
* errors + exit codes → `errors/`

---

## Defaults we assume

* Node >= 18 (see package.json engines)
* Bun test runner
* ESM modules (`"type": "module"`)