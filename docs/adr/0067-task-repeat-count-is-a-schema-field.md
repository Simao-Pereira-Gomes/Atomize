# A task's repeat count is a literal Template field, and repeated tasks never take part in dependencies

Some Stories need several identical Tasks from one definition, such as one "add review conclusions" Task per dev. A task definition can now set `repeat: N`, and generation creates N Tasks, titled with their position ("Review (1)", "Review (2)", ...). This breaks the previous rule that one task definition produces at most one Task.

The count is a plain number written in the Template. It is not a value given at generate time and not read from the Story. A run generates for every Story the Template's filter matches, so one value at generate time would apply to all of them anyway. A field keeps the count reviewable, versioned and identical across the CLI, the VS Code extension and Studio.

A few rules follow from the copies being interchangeable:

- **No dependencies, in either direction.** A repeated task can't have `dependsOn`, and no task can depend on a repeated one. A dependency link needs a single Work Item at each end, and there's no meaningful choice between copies. Offline Validation rejects both cases rather than guessing.
- **The condition applies to the group.** A task's condition is evaluated once against the Story, so either all copies are created or none are.
- **Each copy carries the task's full percentage.** `repeat: 3` on a 10% task contributes 30% before normalization, so the total grows predictably with the count.
- **A safety cap of 20 per task.** A typo like `repeat: 50` would otherwise bulk-create Tasks on a live platform.

## Considered Options

- **A CLI flag or prompt at generate time.** Rejected. A run covers every matching Story, the count wouldn't be recorded with the Template, and other surfaces would each need their own way to supply it.
- **A value type designed for a future dynamic source** (e.g. a number or a Story field reference). Rejected as speculative. No one needs a Story-driven count yet, and a plain number can later be widened to a union without breaking existing Templates.
- **Letting repeated tasks depend, or be depended on, by linking every copy.** Rejected. It multiplies links silently, and no use case asks for it.

## Consequences

- Validation sees definitions while generation produces copies. Constraints that count Tasks or sum percentages must weight each definition by its `repeat` count.
- Story Learner keeps emitting near-duplicate Tasks as separate definitions. It never infers `repeat`.
- Copies can't be customised individually (assignee, estimate, tags). Teams that need that still write separate definitions.
