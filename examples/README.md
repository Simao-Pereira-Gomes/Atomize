# Examples

Real-world Atomize template examples. Each file is a working template you can validate immediately and dry-run against either matching work items or explicit mock stories.

## Files

| File | What it demonstrates |
|------|----------------------|
| [`backend.atomize.yaml`](#backendatomizeyaml) | Standard backend API workflow with task dependencies |
| [`frontend.yaml`](#frontendyaml) | React component development workflow |
| [`fullstack.atomize.yaml`](#fullstackatomizeyaml) | Combined backend + frontend with a branching task graph |
| [`conditional-dependencies-template.atomize.yaml`](#conditional-dependencies-templateatomizeyaml) | Conditional tasks — tasks that only appear when a story meets specific criteria |
| [`conditional-percentage-template.atomize.yaml`](#conditional-percentage-templateatomizeyaml) | Conditional estimation — task weights that adapt to story size and tags |
| [`advanced-filtering.atomize.yaml`](#advanced-filteringatomizeyaml) | Full filter criteria showcase: state exclusion, historical states, area/iteration hierarchy, date filters, team override |
| [`custom-location.atomize.yaml`](#custom-locationatomizeyaml) | A template stored outside a standard `templates/`/`atomize/` directory — the `.atomize.yaml` extension alone is a durable VS Code opt-in regardless of file location |
| [`points-to-hours.atomize.yaml`](#points-to-hoursatomizeyaml) | Estimation conversion with a factor — 1 story point = 4 hours, plus rounding, a minimum, and skipping unestimated Stories |
| [`fibonacci-hours-table.atomize.yaml`](#fibonacci-hours-tableatomizeyaml) | A numeric conversion table for points that don't scale linearly, with a default Story Estimate and a point-based condition |
| [`tshirt-size-estimation.atomize.yaml`](#tshirt-size-estimationatomizeyaml) | T-shirt sizes from a custom picklist field — `source`, a size table, fractional sizes like `0.5XL`, and size conditions |
| [`custom-fields-and-task-type.atomize.yaml`](#custom-fields-and-task-typeatomizeyaml) | A customised process — categorical complexity in, a custom child work item type (`taskType`) and effort field (`targetFields`) out |
| [`repeated-review-tasks.atomize.yaml`](#repeated-review-tasksatomizeyaml) | One review Task per developer from a single definition with `repeat`, alongside ordinary dependent tasks |

---

## backend.atomize.yaml

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
atomize validate examples/backend.atomize.yaml
atomize generate examples/backend.atomize.yaml --platform mock
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
atomize generate examples/frontend.yaml --platform mock
```

---

## fullstack.atomize.yaml

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
atomize validate examples/fullstack.atomize.yaml
atomize generate examples/fullstack.atomize.yaml --platform mock --story STORY-004
```

---

## conditional-dependencies-template.atomize.yaml

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
atomize validate examples/conditional-dependencies-template.atomize.yaml
atomize generate examples/conditional-dependencies-template.atomize.yaml --platform mock --story STORY-004
```

---

## conditional-percentage-template.atomize.yaml

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
atomize validate examples/conditional-percentage-template.atomize.yaml
atomize generate examples/conditional-percentage-template.atomize.yaml --platform mock
```

---

## advanced-filtering.atomize.yaml

A reference template that demonstrates every available filter option. Use it as a starting point when you need precise control over which work items Atomize processes.

**Key features shown:**

| Filter | What it does |
|--------|-------------|
| `team` | Overrides the team from the selected Azure DevOps profile for this template |
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
atomize validate examples/advanced-filtering.atomize.yaml
atomize generate examples/advanced-filtering.atomize.yaml --platform mock --story STORY-001

# Dry-run the estimation configuration examples
for f in examples/points-to-hours.atomize.yaml examples/fibonacci-hours-table.atomize.yaml examples/tshirt-size-estimation.atomize.yaml examples/custom-fields-and-task-type.atomize.yaml; do
  atomize generate "$f" --platform mock --story STORY-003 STORY-005
done
```

---

## custom-location.atomize.yaml

Demonstrates that the `.atomize.yaml` file extension alone is a durable Atomize YAML opt-in in VS Code — schema hovers, completions, and diagnostics work regardless of where the file lives, not just inside a `templates/` or `atomize/` directory.

**Matches:** User Stories in states `New` or `Active`, without existing tasks.

**Tasks (2):**
1. Implement — 70%
2. Test — 30% *(depends on implementation)*

**Try it:**
```bash
atomize validate examples/custom-location.atomize.yaml
atomize generate examples/custom-location.atomize.yaml --platform mock
```

---

## points-to-hours.atomize.yaml

The simplest **Estimation Conversion**: every story point is worth the same number of hours. The Story Estimate is read from the platform default (on Azure DevOps: Story Points, then Effort, then Size), multiplied by the `factor`, and then split across tasks by percentage. Rounding and the minimum apply to each task afterwards.

**Key features shown:** `conversion.factor`, `rounding`, `minimumTaskEstimate`, `ifParentHasNoEstimation: skip`.

| Story | Converted | Design 10% | Implement 60% | Test 25% | Review 5% |
|-------|-----------|------------|---------------|----------|-----------|
| 3 points | 12 h | 1 h | 7 h | 3 h | 0.5 h |
| 13 points | 52 h | 5 h | 31 h | 13 h | 2.5 h |

**Try it:**
```bash
atomize validate examples/points-to-hours.atomize.yaml
atomize generate examples/points-to-hours.atomize.yaml --platform mock --story STORY-003 STORY-005
```

---

## fibonacci-hours-table.atomize.yaml

For teams whose hours grow faster than their points. A numeric `conversion.table` gives each Fibonacci value its own hours, so a 13-point Story is 80 hours rather than 13 × a fixed factor. A value that isn't in the table (often a typo, such as `4`) is never guessed: with `use-default` it is treated as the default Story Estimate.

**Key features shown:**
- `conversion.table` with numeric keys (`1: 2`, `2: 4`, `3: 8`, `5: 16`, `8: 40`, `13: 80`)
- `ifParentHasNoEstimation: use-default` with `defaultParentEstimation: 5`
- A condition on `estimation` (`gte 8`) — conditions compare the **raw** points, not the converted hours

**Try it:**
```bash
atomize validate examples/fibonacci-hours-table.atomize.yaml
atomize generate examples/fibonacci-hours-table.atomize.yaml --platform mock --story STORY-003 STORY-005
```
STORY-003 (13 points) becomes 80 hours and gets the Architecture review; STORY-005 (3 points) becomes 8 hours without it.

---

## tshirt-size-estimation.atomize.yaml

Stories sized with T-shirt sizes in a custom picklist field. `estimation.source` names that field. When it is set, Atomize reads only that field, never falling back to story points. The `table` turns each size into hours, and `multipliers: true` also accepts fractional sizes, so `0.5XL` is half the XL hours.

**Key features shown:**
- `estimation.source: Custom.TShirtSize` (replace with your field's reference name)
- A size `table` (`XS: 2` … `XL: 40`) with `multipliers: true`
- `defaultParentEstimation: "M"` — unsized Stories are treated as M
- Size conditions with `equals` (an Architecture review for `L` or `XL` Stories); use `equals`/`not-equals` for categories, never `gt`/`lt`

| Story size | Converted | Build 60% | Test 25% | Review 10% | Architecture review 5% |
|------------|-----------|-----------|----------|------------|------------------------|
| M | 8 h | 5 h | 2 h | 1 h | — |
| L | 20 h | 12 h | 5 h | 2 h | 1 h |
| 0.5XL | 20 h | 12.5 h | 5 h | 2 h | — |

When the Architecture review is skipped, its 5% is redistributed across the other tasks. Note that `0.5XL` converts like half an XL, but it does **not** match the `equals XL` condition, because conditions compare the raw Story Estimate exactly.

Run Online Validation (`--profile <name>`) to check that the table covers every value of your picklist. It warns about sizes with no conversion and about table keys that aren't real picklist values.

**Try it:**
```bash
atomize validate examples/tshirt-size-estimation.atomize.yaml
atomize generate examples/tshirt-size-estimation.atomize.yaml --platform mock --story STORY-003
```
The mock Stories have no T-shirt size field, so this dry run shows the fallback: each Story is treated as `M` (8 hours) and a warning explains why.

---

## custom-fields-and-task-type.atomize.yaml

For a customised process that doesn't use the platform's standard estimation fields. The Story Estimate comes from a categorical `Custom.Complexity` field, tasks are created as a custom `Deliverable` work item type, and the effort is written to `Custom.Effort` instead of Remaining Work / Original Estimate.

**Key features shown:**
- `taskType` — the child work item type (defaults to `Task` on Azure DevOps)
- `estimation.targetFields` — replaces the platform's estimate fields entirely; values are written exactly as calculated (no unit) and Completed Work is not set
- A categorical `source` with a table (`Low: 4`, `Medium: 8`, `High: 16`, `Very High: 32`)
- `ifParentHasNoEstimation: warn` — an unknown complexity leaves the effort blank and reports a warning

Online Validation checks that `Deliverable` exists in the project and that `Custom.Effort` exists on it and is numeric.

**Try it:**
```bash
atomize validate examples/custom-fields-and-task-type.atomize.yaml
atomize generate examples/custom-fields-and-task-type.atomize.yaml --platform mock --story STORY-003 STORY-005
```
STORY-003 (`Very High`) converts to 32 and STORY-005 (`Medium`) to 8.

---

## repeated-review-tasks.atomize.yaml

One review conclusions Task per developer, written once. `repeat: 4` creates four identical Tasks titled "Add review conclusions (1)" to "(4)". Each copy gets the full 10%, so the template sums to 10% + 50% + 4 × 10% = 100%.

**Key features shown:**
- `repeat` on a task definition
- `validation.totalEstimationMustBe` and `maxTasks`, which count each copy (6 Tasks are generated)
- Ordinary `dependsOn` on the other tasks. A repeated task can't use `dependsOn`, and no task can depend on it

| Story | Design 10% | Implement 50% | Each review copy 10% |
|-------|------------|---------------|----------------------|
| 13 points | 1.3 | 6.5 | 1.3 (× 4) |

**Try it:**
```bash
atomize validate examples/repeated-review-tasks.atomize.yaml
atomize generate examples/repeated-review-tasks.atomize.yaml --platform mock --story STORY-003
```

---

## Running All Examples

```bash
# Validate all examples
for f in examples/*.yaml; do
  echo "Validating $f..."
  atomize validate "$f"
done

# Dry-run examples that match the bundled mock filters
for f in examples/backend.atomize.yaml examples/frontend.yaml examples/conditional-percentage-template.atomize.yaml; do
  echo "Testing $f..."
  atomize generate "$f" --platform mock
done

# Dry-run examples whose filters are intentionally more specific than the mock dataset
atomize generate examples/fullstack.atomize.yaml --platform mock --story STORY-004
atomize generate examples/conditional-dependencies-template.atomize.yaml --platform mock --story STORY-004
atomize generate examples/advanced-filtering.atomize.yaml --platform mock --story STORY-001
```

---

## See Also

- [Template Reference](../docs/Template-Reference.md) — full template schema
- [Validation Modes](../docs/Validation-Modes.md) — strict vs lenient validation
- [CLI Reference](../docs/Cli-Reference.md) — all commands and flags
