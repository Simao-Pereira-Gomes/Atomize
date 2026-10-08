# With a saved query, `workItemTypes` describes the query's results instead of filtering them

A saved query (`filter.savedQuery`) decides which work items a Template applies to, and structured filter fields next to it are ignored at runtime. Validation used to flag `workItemTypes` alongside a saved query as one of those ignored fields, and the VS Code quick fix deleted it. That left saved-query Templates with no record of which work item types they act on. Several features need exactly that:

- the estimation Story field picker (CLI wizard and Studio);
- the condition field pickers;
- Online Validation of `estimation.source` and of condition fields.

Without it, those features fell back to every field in the project, or to typed input.

We changed the meaning instead of adding a new key. Alongside a saved query, `workItemTypes` **declares which types the query returns**. It never filters the query's results: only `excludeIfHasTasks` and `limit` apply after a saved query runs, and that is unchanged. It is used purely for field lookups and validation. The other structured fields (`states`, `tags`, area and iteration paths, dates, priority, ...) are still reported as conflicting, and the quick fix still removes them, but no longer removes `workItemTypes`. The CLI wizard asks for the types when a saved query is chosen. Studio's saved-query mode shows them and prompts when they are empty, without blocking, so Templates written before this change still save. The built-in saved-query Template declares `User Story`.

## Considered Options

- **A separate key** such as `savedQuery.workItemTypes` or `filter.queryReturnsTypes`. It would be unambiguous, but it duplicates a concept the schema already has, and authors would have to learn that the familiar key is ignored while a near-identical one is not.
- **Ask for the types in the wizard only, without saving them.** That is simpler, but the information is lost on the next edit, and Studio and Online Validation would still have to guess.
- **Make `workItemTypes` filter saved-query results client-side.** Rejected because the query is the single source of truth for selection. A second, silent filter would make "why wasn't my Story processed?" much harder to answer.

## Consequences

- A reader of a saved-query Template might assume `workItemTypes` filters. The schema description, the Template reference and the wizard prompt all say it doesn't.
- Saved-query Templates without `workItemTypes` keep working. Field pickers fall back to every field in the project for them.
