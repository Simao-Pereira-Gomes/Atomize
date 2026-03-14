# Examples

Real-world Atomize template examples. Each file is a working template you can validate and run immediately.

## Files

| File | What it demonstrates |
|------|----------------------|
| [`backend.yaml`](#backendyaml) | Standard backend API workflow with task dependencies |
| [`frontend.yaml`](#frontendyaml) | React component development workflow |
| [`fullstack.yaml`](#fullstackyaml) | Combined backend + frontend with a branching task graph |
| [`conditional-dependencies-template.yaml`](#conditional-dependencies-templateyaml) | Conditional tasks — tasks that only appear when a story meets specific criteria |
| [`conditional-percentage-template.yaml`](#conditional-percentage-templateyaml) | Conditional estimation — task weights that adapt to story size and tags |
| [`advanced-filtering.yaml`](#advanced-filteringyaml) | Full filter criteria showcase: state exclusion, historical states, area/iteration hierarchy, date filters, team override |

---

## backend.yaml

A production-ready backend API template. Covers the full development cycle from API design through code review, with dependencies enforcing a logical order.

**Matches:** User Stories and Product Backlog Items tagged `backend` or `api`, in states `New`, `Approved`, or `Active`, that don't already have tasks.

**Tasks (6):**
1. Design API Specification — 10%
2. Database Schema Changes — 20%
3. Implement Business Logic — 35% *(depends on design + schema)*
4. Unit & Integration Tests — 20% *(depends on implementation)*
5. API Documentation — 5%
6. Code Review & Refinement — 10%

**Try it:**
```bash
atomize validate examples/backend.yaml
atomize generate examples/backend.yaml --platform mock --dry-run
```

---

## frontend.yaml

A React component development template covering the full UI lifecycle including accessibility testing.

**Matches:** User Stories tagged `frontend` or `react`, in states `New` or `Approved`, without existing tasks.

**Tasks (6):**
1. UI/UX Design Review — 10%
2. Component Structure & Setup — 15%
3. Component Logic Implementation — 30% *(depends on structure)*
4. Styling & Responsive Design — 20%
5. Accessibility Testing — 10%
6. Component Testing — 15% *(depends on logic)*

**Try it:**
```bash
atomize validate examples/frontend.yaml
atomize generate examples/frontend.yaml --platform mock --dry-run
```

---

## fullstack.yaml

A combined backend + frontend template for end-to-end features. Uses a branching dependency graph where the backend and frontend tracks run in parallel after the design phase, then converge at integration.

**Matches:** User Stories tagged `fullstack`, in states `New` or `Active`, without existing tasks.

**Tasks (9):**
1. Technical Design — 10%
2. Backend API Implementation — 20% *(depends on design)*
3. Database Implementation — 15% *(conditional: only if story has `database` tag)*
4. Backend Tests — 10% *(depends on backend API)*
5. Frontend Components — 20% *(depends on design)*
6. Styling & Responsive Design — 10%
7. Frontend Tests — 8% *(depends on frontend components)*
8. Frontend-Backend Integration — 12% *(depends on both tracks)*
9. Documentation — 5%

**Try it:**
```bash
atomize validate examples/fullstack.yaml
atomize generate examples/fullstack.yaml --platform mock --dry-run
```

---

## conditional-dependencies-template.yaml

Demonstrates **conditional tasks** — tasks that are only created when a story meets specific criteria. When a conditional task is skipped, its estimation is redistributed to the remaining tasks.

**Matches:** User Stories tagged `development`.

**Key features shown:**
- `condition` field with tag-based rules (`CONTAINS "backend"`, `CONTAINS "frontend"`, `CONTAINS "security"`)
- `condition` with compound logic (`AND`, `OR`, `NOT CONTAINS`)
- `condition` based on numeric fields (`${story.estimation} >= 13`)
- Dependencies that span conditional tasks (e.g., `unit-tests` depends on `backend-api` and `frontend-ui` — whichever were created)

**Tasks (9, most conditional):**

| Task | Created when |
|------|-------------|
| UI/UX Design | Always |
| Backend API | Story has `backend` tag |
| Frontend UI | Story has `frontend` tag |
| Accessibility Testing | Story has `frontend` tag OR doesn't have `legacy` tag |
| Security Review | Story has `security` tag AND priority ≤ 2 |
| Unit Tests | Always *(depends on whichever of backend/frontend exist)* |
| Integration Tests | Always *(depends on unit tests)* |
| Performance Testing | Story estimation ≥ 13 points |
| Documentation | Always *(depends on unit tests)* |
| Deployment | Always *(depends on integration tests + docs)* |

**Try it:**
```bash
atomize validate examples/conditional-dependencies-template.yaml
atomize generate examples/conditional-dependencies-template.yaml --platform mock --dry-run
```

---

## conditional-percentage-template.yaml

Demonstrates **`estimationPercentCondition`** — each task's percentage of the story adapts based on the story's size and tags. This is useful when the same task represents different amounts of work depending on story complexity.

**Matches:** All User Stories without existing tasks.

**Key features shown:**
- `estimationPercentCondition` on multiple tasks
- First-match-wins rule evaluation order
- Conditional task combined with conditional estimation (the `frontend-impl` task is both conditional *and* has an adaptive percentage)
- Normalization using resolved conditional percentages as the baseline (not static fallbacks)

**Tasks (5):**

| Task | Default % | Conditional rules |
|------|-----------|-------------------|
| Technical Design | 10% | ≥ 13 pts → 20%, ≥ 5 pts → 15% |
| Backend Implementation | 60% | `fullstack` tag → 40%, ≥ 5 pts → 50% |
| Frontend Implementation | 30% | `complex-ui` tag → 40% — *only created for `fullstack` stories* |
| Testing & QA | 20% | `critical` + ≥ 8 pts → 30%, `critical` alone → 25% |
| Code Review | 5% | Always 5% |

**Scenarios and their resolved splits (before normalization):**

| Scenario | Design | Backend | Frontend | Testing | Review | Total |
|----------|--------|---------|----------|---------|--------|-------|
| Small backend (< 5 pts) | 10% | 60% | — | 20% | 5% | 95% |
| Medium backend (5–12 pts) | 15% | 50% | — | 20% | 5% | 90% |
| Medium fullstack (5–12 pts) | 15% | 40% | 30% | 20% | 5% | 110% |
| Large critical fullstack (≥ 13 pts, `critical`) | 20% | 40% | 30% | 30% | 5% | 125% |

All totals are normalized to exactly 100% at generation time.

**Try it:**
```bash
atomize validate examples/conditional-percentage-template.yaml
atomize generate examples/conditional-percentage-template.yaml --platform mock --dry-run
```

---

## advanced-filtering.yaml

A reference template that demonstrates every available filter option. Use it as a starting point when you need precise control over which work items Atomize processes.

**Key features shown:**

| Filter | What it does |
|--------|-------------|
| `team` | Overrides the `AZURE_DEVOPS_TEAM` env var for this template |
| `statesExclude` | Excludes items in `Done`, `Removed`, or `Won't Fix` |
| `statesWereEver` | Matches items that passed through `In Review` historically |
| `areaPathsUnder` | Matches `MyProject\Backend` **and all sub-areas** (hierarchy traversal) |
| `iterationsUnder` | Matches all sprints under `Release 3` (not just one sprint) |
| `changedAfter` | Only items touched in the last 14 days (`@Today-14`) |
| `createdAfter` | Only items created in the last 90 days (`@Today-90`) |

**Supported `@Today` macro syntax:**
- `@Today` — start of today
- `@Today-N` — N days in the past (e.g. `@Today-7`)
- `@Today+N` — N days in the future
- Also: `@StartOfWeek`, `@StartOfMonth`, `@StartOfYear` (with optional offsets)

**Try it:**
```bash
atomize validate examples/advanced-filtering.yaml
atomize generate examples/advanced-filtering.yaml --platform mock --dry-run
```

---

## Running All Examples

```bash
# Validate all examples
for f in examples/*.yaml; do
  echo "Validating $f..."
  atomize validate "$f"
done

# Test all examples against mock data
for f in examples/*.yaml; do
  echo "Testing $f..."
  atomize generate "$f" --platform mock --dry-run
done
```

---

## See Also

- [Template Reference](../docs/Template-Reference.md) — full template schema
- [Validation Modes](../docs/Validation-Modes.md) — strict vs lenient validation
- [CLI Reference](../docs/Cli-Reference.md) — all commands and flags
